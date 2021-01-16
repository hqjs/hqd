// TODO: move to utils and cache in the upper level
import LRUMap from 'lru-cache';
import browserslist from 'browserslist';
import { createReadStream } from '../services/npm.mjs';
import fs from 'fs-extra';
// import { getInstallationStream } from '../services/npm.mjs';
import path from 'path';
import { readConf } from '../utils.mjs';
import stream from 'stream';
import streamBufferCache from '@hqjs/stream-buffer-cache';
import winston from '../logger.mjs';

const { Readable } = stream;

const Cache = streamBufferCache(LRUMap);

const CACHE_SIZE = readConf('cache.compilation', 1024 * 1024 * 1024); // 1Gb
const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 1 month

const cache = new Cache({
  length(buff) {
    return (buff.metadata && buff.metadata.byteLength) || 0;
  },
  max: CACHE_SIZE,
  maxAge: CACHE_MAX_AGE,
});

export const getOutputPath = (ctx, encodingExt = '') => {
  const relativePath = ctx.stats.isSrc ?
    path.join(ctx.store.root, ctx.basePath, ctx.dpath) :
    path.join('./.dist/assets/', ctx.basePath, ctx.dpath);
  return path.resolve(ctx.app.root, `${relativePath}${encodingExt}`);
};

const getKey = (ctx, encodingExt = '') => {
  const relativePath = `${ctx.dpath}${encodingExt}`;
  return ctx.stats.isSrc ?
    path.join(ctx.store.root, ctx.basePath, relativePath) :
    path.join('./.dist/assets/', ctx.basePath, relativePath);
};

export const getCache = (ctx, encodingExt = '') => {
  const key = getKey(ctx, encodingExt);
  const content = cache.get(key);
  if (content) return content;
  if (ctx.app.stream) {
    const { ua } = ctx.store;
    const stats = ctx.app.table.get(ctx.srcPath);
    if (stats) stats.build.setDirty(ua);
    // TODO: Build again instead
    winston.log('Not in cache, redirect to build again', `${ctx.moduleURL}${ctx.request.url}`);
    return ctx.response.redirect(`${ctx.moduleURL}${ctx.request.url}`);
  }
  const outputPath = getOutputPath(ctx, encodingExt);
  return fs.createReadStream(outputPath)
    .pipe(setCache(ctx, encodingExt));
};

export const setCache = (ctx, encodingExt = '') => {
  const key = getKey(ctx, encodingExt);
  return cache.set(key);
};

export const saveContent = async (content, ctx) => {
  const outputPath = getOutputPath(ctx);
  if (!ctx.app.stream) await fs.ensureDir(path.dirname(outputPath));
  // return new Promise((resolve, reject) => new Readable({
  //   read() {
  //     this.push(content);
  //     this.push(null);
  //   },
  // }).pipe(setCache(ctx))
  //   .pipe(fs.createWriteStream(outputPath))
  //   .on('close', resolve)
  //   .on('error', err => {
  //     cache.del(key);
  //     reject(err);
  //   }));
  // TODO: add streaming mode support
  const saveStream = new Readable({
    read() {
      this.push(content);
      this.push(null);
    },
  }).pipe(setCache(ctx));

  if (!ctx.app.stream) saveStream.pipe(fs.createWriteStream(outputPath));

  return null;
};

export const contentExists = (ctx, encodingExt = '') => fs.pathExists(getOutputPath(ctx, encodingExt));

export const save = async (ctx, encodingExt = '') => {
  const outputPath = getOutputPath(ctx, encodingExt);
  if (!ctx.app.stream) await fs.ensureDir(path.dirname(outputPath));
  // TODO: add streaming mode support
  if (ctx.app.stream) {
    // getInstallationStream(ctx.srcPath)
    createReadStream(ctx.srcPath, ctx.app.stream)
      .pipe(setCache(ctx, encodingExt));
    return null;
  } else {
    fs.createReadStream(ctx.srcPath)
      .pipe(setCache(ctx, encodingExt))
      .pipe(fs.createWriteStream(outputPath));
    return null;
  }
};

export const getBrowsersList = ua => browserslist(
  `unreleased ${ua.name} versions, ${ua.name} ${ua.ver}`,
  { ignoreUnknownVersions: true },
);

export const getInputSourceMap = async (srcPath, code) => {
  const [ , mapPath = null ] = code.match(/\/\/#\s*sourceMappingURL=(.*)/) || [];
  try {
    if (!mapPath) {
      // TODO: test with absolute/relative paths
      const mapData = await fs.readFile(`${srcPath}.map`, { encoding: 'utf8' });
      return JSON.parse(mapData);
    } else if (mapPath.startsWith('data:application/json;charset=utf-8;base64,')) {
      const [ , data64 ] = mapPath.split(',');
      const mapData = atob(data64);
      return JSON.parse(mapData);
    } else {
      const mapData = await fs.readFile(mapPath, { encoding: 'utf8' });
      return JSON.parse(mapData);
    }
  } catch (err) {
    return false;
  }
};

export const getScriptExtensionByAttrs = attrs => {
  if (!attrs) return '.js';
  if (attrs.type) switch (attrs.type) {
    case 'application/coffeescript':
    case 'text/coffeescript': return '.coffee';
    case 'application/typescript':
    case 'text/typescript': return '.ts';
    case 'application/jsx':
    case 'text/jsx': return '.jsx';
    default: return '.js';
  }
  if (attrs.lang) switch (attrs.lang) {
    case 'coffeescript': return '.coffee';
    case 'typescript': return '.ts';
    case 'jsx': return '.jsx';
    default: return '.js';
  }
  return '.js';
};

export const getStyleExtensionByAttrs = attrs => {
  if (!attrs) return '.css';
  if (attrs.type) switch (attrs.type) {
    case 'text/scss': return '.scss';
    case 'text/sass': return '.sass';
    case 'text/less': return '.less';
    default: return '.css';
  }
  if (attrs.lang) switch (attrs.lang) {
    case 'scss': return '.scss';
    case 'sass': return '.sass';
    case 'less': return '.less';
    default: return '.css';
  }
  return '.css';
};

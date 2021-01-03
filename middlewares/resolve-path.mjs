import {
  HTTP_CODES,
  isDefaultFavicon,
  isInternal,
  isMap,
} from '../utils.mjs';
import {
  findExistingExtension,
  lstat,
  realpath,
  resolvePackageMain,
} from '../services/npm.mjs';
import fs from 'fs-extra';
import path from 'path';
import querystring from 'querystring';
import winston from '../logger.mjs';

const pathMap = new Map;

export default () => async (ctx, next) => {
  ctx.dpath = querystring.unescape(ctx.path);
  const fullPath = `${ctx.basePath}${ctx.dpath}`;
  const current = pathMap.get(fullPath);
  if (current !== undefined) {
    ctx.dirname = current.dirname;
    ctx.dpath = current.dpath;
    ctx.srcPath = current.srcPath;
    ctx.size = current.size;
    ctx.mtime = current.mtime;
  } else {
    await resolvePath(ctx);
    pathMap.set(fullPath, {
      dirname: ctx.dirname,
      dpath: ctx.dpath,
      mtime: ctx.mtime,
      size: ctx.size,
      srcPath: ctx.srcPath,
    });
  }
  if (ctx.app.debug) winston.log(
    'Resolve path',
    ctx.path,
    ctx.dpath,
    ctx.srcPath,
    ctx.dirname,
    ctx.size,
  );
  return next();
};

const resolveInternal = async ctx => {
  ctx.srcPath = path.join(ctx.app.hqdroot, ctx.dpath.slice(1));
  ctx.dirname = path.dirname(ctx.dpath);
  const stats = isMap(ctx.dpath) ? { size: 0 } : await fs.lstat(ctx.srcPath);
  ctx.size = stats.size;
};

const resolveSrc = async ctx => {
  let isDirectory = false;
  try {
    ctx.srcPath = path.resolve(ctx.installationPath, `.${ctx.dpath}`);
    ctx.srcPath = await realpath(ctx.srcPath, ctx.app.stream);
    const stats = await lstat(ctx.srcPath, ctx.app.stream);
    ctx.size = stats.size;
    ctx.mtime = stats.mtime;
    isDirectory = stats.isDirectory();
    if (isDirectory) {
      await resolveDirectory(ctx);
    } else {
      ctx.dirname = path.dirname(ctx.dpath);
    }
  } catch {
    if (isDirectory) ctx.throw(HTTP_CODES.NOT_FOUND, `File ${ctx.dpath} not found`);
    try {
      await resolveFile(ctx);
    } catch {
      if (isMap(ctx.dpath)) {
        const srcPath = ctx.srcPath.slice(0, -4);
        const ext = await findExistingExtension(srcPath, ctx.app.stream);
        ctx.srcPath = `${srcPath}${ext}`;
        ctx.dpath = `${ctx.dpath.slice(0, -4)}${ext}`;
        await resolveMap(ctx);
      } else if (isDefaultFavicon(ctx.dpath)) await resolveFavicon(ctx);
      else ctx.throw(HTTP_CODES.NOT_FOUND, `File ${ctx.dpath} not found`);
    }
  }
};

const resolveFavicon = async ctx => {
  ctx.srcPath = `${ctx.app.hqdroot}/hqd.png`;
  ctx.dirname = path.dirname(ctx.dpath);
  const stats = await fs.lstat(ctx.srcPath);
  ctx.size = stats.size;
  ctx.mtime = stats.mtime;
};

const resolveMap = async ctx => {
  ctx.srcPath = `${ctx.srcPath}.map`;
  ctx.dpath = `${ctx.dpath}.map`;
  ctx.dirname = path.dirname(ctx.dpath);
  // TODO: resolve size from build here
  ctx.size = 0;
  ctx.mtime = new Date;
};

const resolveFile = async ctx => {
  const ext = await findExistingExtension(ctx.srcPath, ctx.app.stream);
  ctx.dpath += ext;
  ctx.srcPath += ext;
  ctx.dirname = path.dirname(ctx.dpath);
  const stats = await lstat(ctx.srcPath, ctx.app.stream);
  ctx.size = stats.size;
  ctx.mtime = stats.mtime;
};

const resolveDirectory = async ctx => {
  const main = await resolvePackageMain(ctx.srcPath, ctx.app.stream, { search: false });
  const srcPath = path.join(ctx.srcPath, main);
  const ext = await findExistingExtension(srcPath, ctx.app.stream);
  const fileName = `${main}${ext}`;
  ctx.srcPath = path.join(ctx.srcPath, fileName);
  ctx.dpath = path.join(ctx.dpath, fileName);
  ctx.dirname = path.dirname(ctx.dpath);
  const stats = await fs.lstat(ctx.srcPath);
  ctx.size = stats.size;
};

const resolvePath = async ctx => {
  if (isInternal(ctx.dpath)) return resolveInternal(ctx);
  return resolveSrc(ctx);
};


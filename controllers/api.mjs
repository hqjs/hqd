import { HTTP_CODES, packageNameRegex, readConf } from '../utils.mjs';
import { createReadStream, getInfo, install, readdir, search, stat } from '../services/npm.mjs';
import Router from '@koa/router';
import path from 'path';

// TODO: use immutable if available
const STATIC_MAX_AGE = 60 * 60 * 24 * 365; // 365 days
const MAX_AGE = readConf('api.max_age', 5 * 60); // 5 min
const DEFAULT_SEARCH_LIMIT = 50;

const packageSearch = async ctx => {
  const {
    limit = DEFAULT_SEARCH_LIMIT,
    offset = 0,
    query,
  } = ctx.query;

  const { objects } = await search(query, offset, limit, ctx.app.registryConf);

  ctx.body = {
    objects,
    serverTime: new Date().toISOString(),
  };

  ctx.type = 'json';

  ctx.set({
    'Cache-Control': `private, max-age=${MAX_AGE}`,
    'Last-Modified': Date.now(),
  });
};

const packageInfo = async ctx => {
  const { module } = ctx.params;
  const { path: queryPath } = ctx.query;
  const info = await getInfo(module, ctx.app.registryConf);
  ctx.body = queryPath ?
    queryPath === 'versions-list' ?
      Object.keys(info.versions || {}) :
      info[queryPath] :
    info;
  if (!ctx.body) {
    return ctx.throw(HTTP_CODES.NOT_FOUND, 'not implemented');
  }

  ctx.type = 'json';

  ctx.set({
    'Cache-Control': `private, max-age=${MAX_AGE}`,
    'Last-Modified': Date.now(),
  });

  return null;
};

const packageFileTree = async ctx => {
  const { module, version } = ctx.params;
  const { installRoot, stream } = ctx.app;

  const info = await getInfo(module, ctx.app.registryConf);
  const installationPath = await install(info, version, installRoot, stream);

  const readDir = async (root, res = { children: [], name: '/' }) => {
    const files = await readdir(root, ctx.app.stream);

    for (const file of files) {
      const filePath = path.resolve(root, file);
      const fileStat = await stat(filePath, ctx.app.stream);
      if (fileStat.isDirectory()) {
        res.children.push(await readDir(filePath, { children: [], name: file }));
      } else {
        res.children.push({ name: file, size: fileStat.size });
      }
    }

    res.children.sort((a, b) => {
      if (a.children && b.children) {
        return a.name > b.name;
      } else if (a.children) {
        return -1;
      } else if (b.children) {
        return 1;
      } else {
        return a.name > b.name;
      }
    });

    return res;
  };

  ctx.body = await readDir(installationPath);

  if (!ctx.body) {
    return ctx.throw(HTTP_CODES.NOT_FOUND, 'not implemented');
  }

  ctx.type = 'json';

  ctx.set({
    'Cache-Control': `private, max-age=${STATIC_MAX_AGE}`,
    'Last-Modified': Date.now(),
  });

  return null;
};

const packageRaw = async ctx => {
  const { module, version, contentPath } = ctx.params;
  const { installRoot, stream } = ctx.app;

  const info = await getInfo(module, ctx.app.registryConf);
  const installationPath = await install(info, version, installRoot, stream);

  ctx.type = path.extname(contentPath);
  ctx.body = createReadStream(path.resolve(installationPath, contentPath), ctx.app.stream);

  ctx.set({
    'Cache-Control': `private, max-age=${STATIC_MAX_AGE}`,
    'Last-Modified': Date.now(),
  });

  return null;
};

const routings = new Router()
  .get(`/info/:module(${packageNameRegex})`, packageInfo)
  .get(`/filetree/:module(${packageNameRegex})@:version`, packageFileTree)
  .get(`/raw/:module(${packageNameRegex})@:version/:contentPath+`, packageRaw)
  .get('/search', packageSearch);

export const routes = routings.routes();
export const allowedMethods = routings.allowedMethods();

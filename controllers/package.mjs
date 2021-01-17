import { HTTP_CODES, packageNameRegex, readConf } from '../utils.mjs';
import { getInfo, install, resolveMain, resolveVersion } from '../services/npm.mjs';
import Router from '@koa/router';
import hqd from '../hqd.mjs';

const REDIRECT_TIME = readConf('cache.redirect_time', 5 * 60); // 5 min

const resolveVersionMain = async ctx => {
  const { module, version } = ctx.params;
  try {
    const info = await getInfo(module, ctx.app.registryConf);
    const moduleVersion = resolveVersion(info, version);
    const moduleMain = resolveMain(info, moduleVersion);

    const headers = {
      'Cache-Control': `public, max-age=${REDIRECT_TIME}`,
      'Last-Modified': (new Date()).toUTCString(),
    };
    ctx.set(headers);
    return ctx.response.redirect(`/${module}@${moduleVersion}/${moduleMain}`);
  } catch (err) {
    return ctx.throw(HTTP_CODES.NOT_FOUND, err);
  }
};

const ensureInstall = async ctx => {
  const { module, version, contentPath } = ctx.params;
  const { installRoot, registryConf, stream } = ctx.app;
  const info = await getInfo(module, registryConf);
  const moduleVersion = resolveVersion(info, version);

  if (version !== moduleVersion) {
    const headers = {
      'Cache-Control': `public, max-age=${REDIRECT_TIME}`,
      'Last-Modified': (new Date()).toUTCString(),
    };
    ctx.set(headers);
    return ctx.response.redirect(`/${module}@${moduleVersion}/${contentPath}`);
  }

  try {
    ctx.installationPath = await install(info, version, installRoot, stream);
    ctx.basePath = `/${module}/${version}`;
    ctx.moduleURL = `/${module}@${version}`;
    ctx.path = ctx.path.slice(ctx.basePath.length);
  } catch (err) {
    return ctx.throw(HTTP_CODES.NOT_FOUND, `Module could not be installed.\n${err}`);
  }

  return hqd(ctx, () => null);
};

export default new Router()
  .get(`/node_modules/:module(${packageNameRegex})@:version`, resolveVersionMain)
  .get(`/node_modules/:module(${packageNameRegex})`, resolveVersionMain)
  .get(`/node_modules/:module(${packageNameRegex})@:version/:contentPath+`, ensureInstall)
  .get(`/node_modules/:module(${packageNameRegex})/:contentPath+`, ensureInstall)
  .get(`/:module(${packageNameRegex})@:version`, resolveVersionMain)
  .get(`/:module(${packageNameRegex})`, resolveVersionMain)
  .get(`/:module(${packageNameRegex})@:version/:contentPath+`, ensureInstall)
  .get(`/:module(${packageNameRegex})/:contentPath+`, ensureInstall);


import { HTTP_CODES, packageNameRegex } from '../utils.mjs';
import { getInfo, install, resolveVersion } from '../services/npm.mjs';
import Router from '@koa/router';
import fs from 'fs-extra';
import path from 'path';

const packageDoc = async ctx => {
  try {
    const { module, version } = ctx.params;
    const { installRoot, registryConf, stream } = ctx.app;
    const info = await getInfo(module, registryConf);
    const moduleVersion = resolveVersion(info, version);

    if (version !== moduleVersion) {
      return ctx.response.redirect(`/-/doc/${module}/${moduleVersion}`);
    }

    ctx.installationPath = await install(info, version, installRoot, stream);
    ctx.basePath = `/${module}/${version}`;
    ctx.moduleURL = `/${module}@${version}`;
    ctx.path = ctx.path.slice(ctx.basePath.length);

    ctx.type = 'html';
    ctx.body = fs.createReadStream(path.resolve('public/package.html'));

    return null;
  } catch (err) {
    return ctx.throw(HTTP_CODES.NOT_FOUND, `Module could not be installed.\n${err}`);
  }
};

const routings = new Router()
  .get(`/:module(${packageNameRegex})/:version?`, packageDoc);

export const routes = routings.routes();
export const allowedMethods = routings.allowedMethods();

import * as ApiController from './controllers/api.mjs';
import * as DocController from './controllers/doc.mjs';
import { HTTP_CODES, readJSONSync } from './utils.mjs';
import Koa from 'koa';
import PackageController from './controllers/package.mjs';
import Router from '@koa/router';
import Table from './res/table.mjs';
import cors from '@koa/cors';
import fs from 'fs-extra';
import http2 from 'http2';
import info from './package.json';
import path from 'path';

const HQD_ROOT = path.dirname(import.meta.url.slice('file://'.length));

const { version } = info;

console.log(`(c) hqd @ ${version}`);

/* eslint-disable max-statements */
const start = ({
  CERT,
  HOST,
  PORT,
  ROOT,
  STREAM,
} = {}) => {
  const options = {
    allowHTTP1: true,
    cert: fs.readFileSync(path.resolve(ROOT, CERT, 'server.pem')),
    key: fs.readFileSync(path.resolve(ROOT, CERT, 'server-key.pem')),
  };

  const registryConf = {};
  try {
    const npmrc = fs.readFileSync(path.resolve(ROOT, '.npmrc'), { encoding: 'utf-8' });
    const [ , registry, token ] = /\/\/([^/]+)\/:_authToken=(.*)/.exec(npmrc);
    registryConf.registry = registry;
    registryConf.token = token;
  } catch {}

  const app = new Koa;

  app.hqdroot = HQD_ROOT;
  app.port = PORT;
  app.root = ROOT;
  app.stream = STREAM;
  app.registryConf = registryConf;
  app.installRoot = path.resolve(ROOT, '.packages');
  app.debug = process.env.NODE_ENV === 'debug';
  app.table = new Table;
  app.startTime = Date.now();
  app.resolution = {
    '*': '~',
    ...readJSONSync(path.resolve(ROOT, 'resolution.json')),
  };

  app.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      ctx.status = err.status || HTTP_CODES.INTERNAL_SERVER_ERROR;
      const { message, stack } = err;
      ctx.body = { message, stack };
      ctx.app.emit('error', err, ctx);
    }
  });

  let origins;
  try {
    origins = new Set(fs.readFileSync(path.resolve(ROOT, 'origins.conf'), { encoding: 'utf-8' })
      .trim()
      .split('\n'));
  } catch {
    origins = new Set([ '*' ]);
  }

  app.use(cors({
    origin: ctx => {
      const requestOrigin = ctx.get('Origin');
      return origins.has(requestOrigin) || origins.has('*') ? requestOrigin : '';
    },
  }));
  app.use(new Router()
    .get('/', ctx => {
      ctx.type = 'html';
      ctx.body = fs.createReadStream(path.resolve('public/index.html'));
    })
    .use('/-/doc', DocController.routes, DocController.allowedMethods)
    .use('/-/api', ApiController.routes, ApiController.allowedMethods)
    .get('/-/public/:path+', async ctx => {
      ctx.type = path.extname(ctx.path);
      ctx.body = fs.createReadStream(path.resolve(ctx.path.slice('/-/'.length)));
    })
    .get('/favicon.ico', ctx => {
      ctx.body = fs.createReadStream('./favicon.ico');
    })
    .use('', PackageController.routes(), PackageController.allowedMethods())
    .routes());

  const server = http2.createSecureServer(options, app.callback());

  server.listen(PORT, HOST, err => {
    if (err) throw err;
    app.status = 'OK';
    console.log(`Listening on https://${HOST}:${PORT}`);
    if (app.stream) console.warn('Starting in streaming mode. Not recommended for production.');
  });
};
/* eslint-enable max-statements */

export default start;

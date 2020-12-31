import { contentExists, getCache, getOutputPath, setCache } from '../compilers/tools.mjs';
import { HTTP_CODES } from '../utils.mjs';
import fs from 'fs-extra';
import winston from '../logger.mjs';
import zlib from 'zlib';

const COMPRESSION_THRESHOLD = 1024; // 1Kb

const encode = {
  br: zlib.createBrotliCompress,
  deflate: zlib.createDeflate,
  gzip: zlib.createGzip,
};

export const getPrefferedEncoding = (ctx, encodings) =>
  encodings.reduce(
    (res, encoding) =>
      res !== 'identity' ?
        res :
        ctx.acceptsEncodings(encoding, 'identity'),
    'identity',
  );

const extensions = {
  br: '.br',
  deflate: '.zz',
  gzip: '.gz',
  identity: '',
};

/* eslint-disable max-statements */
export default () => async (ctx, next) => {
  ctx.encoding = getPrefferedEncoding(ctx, [
    'br',
    'gzip',
    'deflate',
    'identity',
  ]);
  ctx.response.vary('Accept-Encoding');
  if (!ctx.encoding) ctx.throw(HTTP_CODES.NOT_ACCEPTABLE, 'supported encodings: gzip, deflate, identity, br');
  const compress = (ctx.size > COMPRESSION_THRESHOLD || ctx.stats.ext === '.map') &&
    ctx.encoding !== 'identity' &&
    ctx.stats.compress;
  if (!compress || ctx.request.method === 'HEAD') {
    ctx.body = getCache(ctx);
    return next();
  }
  // ctx.res.removeHeader('Content-Length');
  ctx.set('Content-Encoding', ctx.encoding);

  const encodingExt = compress ? extensions[ctx.encoding] : '';
  const buildExists = await contentExists(ctx, encodingExt);
  if (buildExists) {
    ctx.body = getCache(ctx, encodingExt);
    return next();
  }

  // ctx.res.removeHeader('Content-Length');
  const savedContent = getCache(ctx);
  if (!savedContent) {
    return next();
  }
  const content = savedContent
    .pipe(encode[ctx.encoding]());
  const outputPath = getOutputPath(ctx, encodingExt);
  const saveStream = content.pipe(setCache(ctx, encodingExt));
  if (!ctx.app.stream) saveStream.pipe(fs.createWriteStream(outputPath));

  ctx.body = content;
  winston.log('info', 'Configure compression', { module: ctx.moduleURL, path: ctx.path });
  return next();
};
/* eslint-enable max-statements */

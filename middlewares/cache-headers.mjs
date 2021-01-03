import winston from '../logger.mjs';

const MAX_AGE = 365 * 24 * 60 * 60; // in seconds, 365 days

export default () => async (ctx, next) => {
  if (ctx.app.debug) winston.log('info', 'Set cache headers', { module: ctx.basePath, path: ctx.path });
  const headers = {
    'Cache-Control': `public, max-age=${MAX_AGE}, immutable`,
    'Last-Modified': ctx.mtime.toUTCString(),
  };

  ctx.set(headers);

  return next();
};

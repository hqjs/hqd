import winston from '../logger.mjs';

export default () => (ctx, next) => {
  ctx.stats = ctx.app.table.get(ctx.srcPath) || ctx.app.table.touch(ctx.srcPath);
  if (ctx.app.debug) winston.log('Get resource table', ctx.path, ctx.stats);
  return next();
};

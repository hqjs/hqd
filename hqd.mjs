import build from './middlewares/build.mjs';
import cacheHeaders from './middlewares/cache-headers.mjs';
import checkSupport from './middlewares/check-support.mjs';
import compose from 'koa-compose';
import compress from './middlewares/compress.mjs';
import detectUA from './middlewares/detect-ua.mjs';
import resolvePath from './middlewares/resolve-path.mjs';
import resourceTable from './middlewares/resource-table.mjs';

export default compose([
  detectUA(),
  checkSupport(),
  resolvePath(),
  resourceTable(),
  build(),
  cacheHeaders(),
  compress(),
]);

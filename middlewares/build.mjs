import {
  contentExists,
  getInputSourceMap,
  save,
  saveContent,
} from '../compilers/tools.mjs';
import { readBinFile, readFile } from '../services/npm.mjs';
import { HTTP_CODES } from '../utils.mjs';
import compileCSS from '../compilers/css.mjs';
import compileHTML from '../compilers/html.mjs';
import compileJS from '../compilers/js.mjs';
import minifyImage from '../compilers/image.mjs';

const buildAsset = async ctx => {
  switch (ctx.stats.ext) {
    // case '.webp':
    case '.gif':
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.svg': {
      // if (ctx.app.stream) return save(ctx);
      const content = await readBinFile(ctx.srcPath, ctx.app.stream);
      const modifiedContent = await minifyImage(ctx, content);
      return saveContent(modifiedContent, ctx);
    }
    default:
      return save(ctx);
  }
};

const buildSource = async ctx => {
  const content = await readFile(ctx.srcPath, ctx.app.stream);
  const inputSourceMap = await getInputSourceMap(ctx.srcPath, content);
  let res;
  // TODO: make dynamic extension resolver
  switch (ctx.stats.ext) {
    case '.js':
    case '.jsx':
    case '.es6':
    case '.vue':
    case '.svelte':
    case '.mjs':
    case '.ts':
    case '.tsx': {
      res = await compileJS(ctx, content, inputSourceMap);
      break;
    }
    case '.css':
    case '.scss':
    case '.sass':
    case '.less': {
      res = await compileCSS(ctx, content, inputSourceMap);
      break;
    }
    case '.pug':
    case '.html': {
      res = await compileHTML(ctx, content);
      break;
    }
    // default: {
    //   const { default: compileReplace } = await import('../compilers/replace.mjs');
    //   res = await replace(ctx, content);
    //   break;
    // }
    default: return save(ctx);
  }
  const { code, map } = res;
  if (map) {
    const { ua } = ctx.store;
    const stats = ctx.app.table.touch(`${ctx.srcPath}.map`);
    // TODO: add map byte length here
    const mapBuildPromise = saveContent(
      JSON.stringify(map),
      {
        app: {
          root: ctx.app.root,
          stream: ctx.app.stream,
        },
        basePath: ctx.basePath,
        dpath: `${ctx.dpath}.map`,
        moduleURL: ctx.moduleURL,
        path: `${ctx.path}.map`,
        stats,
        store: ctx.store,
      },
    );
    stats.build.set(ua, mapBuildPromise);
  }
  return saveContent(code, ctx);
};

const makeBuild = ctx => ctx.stats.isSrc ?
  buildSource(ctx) :
  buildAsset(ctx);

const getBuild = async ctx => {
  const { ext } = ctx.stats;
  const { ua } = ctx.store;
  if (ext === '.map') {
    const { build: srcBuild } = ctx.app.table.get(ctx.srcPath.slice(0, -4)) || {};
    if (srcBuild) await srcBuild.get(ua);
  }
  const { build } = ctx.stats;
  const isDirty = build.isDirty(ua);
  if (isDirty) {
    const buildExists = await contentExists(ctx);
    if (buildExists) {
      const buildPromise = Promise.resolve(null);
      build.set(ua, buildPromise);
      return buildPromise;
    }
    if (ext === '.map') ctx.throw(HTTP_CODES.NOT_FOUND, `File ${ctx.dpath} not found`);
    if (ctx.app.debug) console.log('Building', ctx.path, ua);
    const buildPromise = makeBuild(ctx);
    build.set(ua, buildPromise);
    return buildPromise;
  } else {
    if (ctx.app.debug) console.log('Skip building', ctx.path);
    return build.get(ua);
  }
};

export default () => async (ctx, next) => {
  const { build } = ctx.stats;
  const { ua } = ctx.store;
  try {
    await getBuild(ctx);
    if (ctx.app.debug) console.log('Sending', ctx.path);
    ctx.type = ctx.stats.type;
  } catch (err) {
    build.setDirty(ua);
    ctx.body = err.message;
    ctx.throw(HTTP_CODES.INTERNAL_SERVER_ERROR, err);
    return null;
  }
  return next();
};

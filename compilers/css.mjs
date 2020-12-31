import crypto from 'crypto';
import cssModules from 'postcss-modules';
import cssnano from 'cssnano';
import { getBrowsersList } from './tools.mjs';
import less from 'less';
import lessSyntax from 'postcss-less';
import { pathToURL } from '../utils.mjs';
import postcss from 'postcss';
import postcssPresetEnv from 'postcss-preset-env';
import sass from 'node-sass';
import sassSyntax from 'postcss-sass';
import scssSyntax from 'postcss-scss';
import url from 'url';

export const modulesCache = new Map;

const preprocess = async (ctx, content, sourceMap, { skipSM }) => {
  const preOptions = { from: `${ctx.path}.map*` };
  const prePlugins = [ root => {
    const replacePath3 = (math, p1, styleImport, p2) =>
      styleImport.startsWith('/') ?
        `${p1}${url.resolve(`${pathToURL(ctx.app.src)}/`, styleImport.slice(1))}${p2}` :
        `${p1}.${url.resolve(`${pathToURL(ctx.dirname)}/`, styleImport)}${p2}`;
    const replacePath1 = (match, styleImport) =>
      styleImport.startsWith('/') ?
        `${url.resolve(`${pathToURL(ctx.app.src)}/`, styleImport.slice(1))}` :
        `.${url.resolve(`${pathToURL(ctx.dirname)}/`, styleImport)}`;
    root.walkAtRules('import', rule => {
      rule.params = rule.params
        .replace(/(url\(['"]*)([^'")]+)(['"]*\))/g, replacePath3)
        .replace(/(['"])([^'"]+)(['"])/g, replacePath3)
        .replace(/\s+([^\s'"]+\.(css|scss|sass|less))/g, replacePath1);
    });
    // TODO: check if it should be transformed in url and font-face
  } ];
  if (ctx.stats.ext === '.scss') {
    preOptions.syntax = scssSyntax;
  } else if (ctx.stats.ext === '.sass') {
    preOptions.syntax = sassSyntax;
  } else if (ctx.stats.ext === '.less') {
    preOptions.parser = lessSyntax.parser;
    preOptions.syntax = lessSyntax;
  }
  if (!skipSM) preOptions.map = {
    annotation: `${ctx.moduleURL}${ctx.dpath}.map`,
    inline: false,
    prev: sourceMap,
  };
  const { css, map } = await postcss(prePlugins)
    .process(content, preOptions);

  return { css, map };
};

const precompile = async (ctx, content, sourceMap) => {
  // FIXME: use source map during sass/less compilation
  if (ctx.stats.ext === '.scss' || ctx.stats.ext === '.sass') {
    const result = await new Promise((resolve, reject) => sass.render({
      data: content,
      indentedSyntax: ctx.stats.ext === '.sass',
      sourceMap: true,
      sourceMapContents: true,
    }, (err, res) => err ? reject(err) : resolve(res)));
    const css = result.css.toString();
    const map = result.map ? JSON.parse(result.map.toString()) : '';
    return { css, map };
  } else if (ctx.stats.ext === '.less') {
    const result = await less.render(content, { sourceMap: { sourceMapFullFilename: `${ctx.path}.map` } });
    const { css } = result;
    const map = result.map ? JSON.parse(result.map.toString()) : '';
    return { css, map };
  } else {
    return { css: content, map: sourceMap };
  }
};

const compile = async (ctx, content, sourceMap, { skipSM, useModules }) => {
  const { ua } = ctx.store;
  const presetOptions = {
    features: {
      calc: false,
      customProperties: false,
      prev: sourceMap,
    },
  };
  if (ctx.app.build) {
    presetOptions.stage = 4;
  } else {
    presetOptions.browsers = getBrowsersList(ua);
  }
  const plugins = [
    // FIXME: add package plugins
    // ...ctx.app.cssPlugins,
    postcssPresetEnv(presetOptions),
    cssnano({
      preset: [
        'default', {
          reduceInitial: false,
          reduceTransforms: false,
        },
      ],
    }),
  ];

  const options = { from: `${ctx.path}.map*` };
  if (!skipSM) options.map = {
    annotation: `${ctx.moduleURL}${ctx.dpath}.map`,
    inline: false,
    prev: sourceMap,
  };

  if (useModules) {
    plugins.push(cssModules({
      generateScopedName(name) {
        const hash = crypto
          .createHash('md5')
          .update(ctx.srcPath)
          .digest('hex');
        return `${name}_${hash}`;
      },
      getJSON(cssFileName, json) {
        modulesCache.set(ctx.srcPath, json);
      },
    }));
  }

  const { css, map } = await postcss(plugins)
    .process(content, options);

  return { code: css, map };
};

export default async (ctx, content, sourceMap, { skipSM = false, useModules = modulesCache.has(ctx.srcPath) } = {}) => {
  const { css: preContent, map: preMap } = await preprocess(ctx, content, sourceMap, { skipSM });
  const { css: precompContent, map: precompMap } = await precompile(ctx, preContent, preMap);
  return compile(ctx, precompContent, precompMap, { skipSM, useModules });
};

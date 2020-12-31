import { getScriptExtensionByAttrs, getStyleExtensionByAttrs } from './tools.mjs';
import compileCSS from './css.mjs';
import compileJS from './js.mjs';
import htmlnano from 'htmlnano';
import posthtml from 'posthtml';
import pug from 'posthtml-pug';
// import { resolvePackageFrom } from '../utils.mjs';

const PUBLIC_URL = '%PUBLIC_URL%';

export default async (ctx, content) => {
  const inputContent = content;
  const isPug = ctx.stats.ext === '.pug';
  const options = isPug ?
    {
      parser: pug({
        compileDebug: false,
        filename: ctx.srcPath,
        locals: {},
        pretty: true,
      }),
    } :
    undefined;
  let scriptIndex = 0;
  let styleIndex = 0;
  const { html } = await posthtml([
    // FIXME: add package plugins
    // ...ctx.app.htmlPlugins,
    tree => {
      tree.match({ tag: 'link' }, node => {
        if (node.attrs && node.attrs.href != null) node.attrs.href = node.attrs.href.replace(PUBLIC_URL, '');
        return node;
      });
    },
    /* eslint-disable complexity */
    tree => {
      const promises = [];
      tree.match({ tag: 'script' }, node => {
        if (node.attrs && node.attrs.src != null) node.attrs.src = node.attrs.src.replace(PUBLIC_URL, '');
        if (node.attrs && node.attrs.src != null && node.attrs.src.startsWith('/node_modules/')) {
          node.attrs.src = node.attrs.src.slice('/node_modules'.length);
          // TODO: support nomodule
          // node.attrs.src = `${node.attrs.src}?hq_type=nomodule`;
        }
        // if (
        //   node.attrs &&
        //   node.attrs.src != null &&
        //   !node.attrs.src.startsWith('/') &&
        //   !node.attrs.src.startsWith('.') &&
        //   !node.attrs.src.startsWith('https://') &&
        //   !node.attrs.src.startsWith('http://')
        // ) {
        //   promises.push(resolvePackageFrom(ctx.app.root, `/node_modules/${node.attrs.src}`, ctx.app.hqdroot)
        //     .then(modulePath => fs.pathExists(modulePath).then(exists => {
        //       if (exists) {
        //         node.attrs.src = `/${node.attrs.src}`;
        //         if (!('module' in node.attrs)) node.attrs.src = `${node.attrs.src}?hq_type=nomodule`;
        //       } else {
        //         node.attrs = {
        //           ...node.attrs,
        //           src: `./${node.attrs.src}`,
        //           type: 'module',
        //         };
        //       }
        //     }))
        //     .catch(() => {
        //       node.attrs = {
        //         ...node.attrs,
        //         src: `./${node.attrs.src}`,
        //         type: 'module',
        //       };
        //     }));
        //   return node;
        // }
        if (
          node.attrs &&
          node.attrs.src != null &&
          !('nomodule' in node.attrs) &&
          (
            node.attrs.src.startsWith(ctx.origin) ||
            node.attrs.src.startsWith('/') ||
            node.attrs.src.startsWith('.') ||
            !node.attrs.src.startsWith('http')
          )
        ) {
          node.attrs = {
            ...node.attrs,
            type: 'module',
          };
          return node;
        }
        if (!node.attrs || node.attrs.src == null) {
          const ext = getScriptExtensionByAttrs(node.attrs);
          if (ext === '') return node;
          const worker = node.attrs && node.attrs.type === 'text/js-worker' ? 'worker-' : '';
          const nodeContent = node.content.join('');
          // TODO: check if sourcemaps can be usefull for inline scripts
          const index = ++scriptIndex;
          promises.push(compileJS({
            ...ctx,
            dpath: `${ctx.dpath}-${worker}${index}${ext}`,
            moduleURL: ctx.moduleURL,
            path: `${ctx.path}-${worker}${index}${ext}`,
            stats: {
              ...ctx.stats,
              ext,
            },
          }, nodeContent, false, { skipSM: true }).then(({ code }) => {
            node.content = [ code ];
          }));
          return node;
        }
        if (node.attrs && node.attrs.src && !('defer' in node.attrs) && !('async' in node.attrs)) {
          node.attrs.defer = '';
        }
        return node;
      });
      return Promise.all(promises).then(() => tree);
    },
    /* eslint-enable complexity */
    tree => {
      const promises = [];
      tree.match({ tag: 'style' }, node => {
        const ext = getStyleExtensionByAttrs(node.attrs);
        const [ nodeContent ] = node.content;
        const index = ++styleIndex;
        promises.push(compileCSS({
          ...ctx,
          dpath: `${ctx.dpath}$${index}${ext}`,
          moduleURL: ctx.moduleURL,
          path: `${ctx.path}$${index}${ext}`,
          stats: {
            ...ctx.stats,
            ext,
          },
        }, nodeContent, false, { skipSM: true }).then(({ code }) => {
          node.content = [ code ];
        }));
        return node;
      });
      return Promise.all(promises).then(() => tree);
    },
    htmlnano({
      collapseAttributeWhitespace: true,
      collapseBooleanAttributes: { amphtml: false },
      collapseWhitespace: 'conservative',
      custom: [],
      deduplicateAttributeValues: true,
      mergeScripts: true,
      mergeStyles: true,
      minifyCss: false,
      minifyJs: false,
      minifyJson: {},
      minifySvg: {
        plugins: [
          { collapseGroups: false },
          { convertShapeToPath: false },
        ],
      },
      removeComments: 'safe',
      removeEmptyAttributes: true,
      removeRedundantAttributes: false,
      removeUnusedCss: false,
    }),
  ])
    .process(inputContent, options);
  return { code: html };
};

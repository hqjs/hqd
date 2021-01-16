import compileCSS, { modulesCache } from './css.mjs';
import {
  getBrowsersList,
  getInputSourceMap,
  getScriptExtensionByAttrs,
  getStyleExtensionByAttrs,
  saveContent,
} from './tools.mjs';
import {
  getInfo,
  install,
  readFile,
  readFileSync,
  readPackageJSON,
  resolveDependencies,
} from '../services/npm.mjs';
import {
  getVersion,
  isAngularCompiler,
  isInternal,
  isPolyfill,
  isWorker,
  pathToURL,
  urlToPath,
} from '../utils.mjs';
import CoffeeScript from 'coffeescript';
import babel from '@babel/core';
import babelMinifyDeadCode from 'babel-plugin-minify-dead-code-elimination';
import babelPresetEnv from '@babel/preset-env';
import babelPresetFlow from '@babel/preset-flow';
import babelPresetMinify from 'babel-preset-minify';
import babelPresetReact from '@babel/preset-react';
import babelTransformAssetsImport from 'babel-plugin-transform-assets-import-to-string';
import babelTransformClassProperties from '@babel/plugin-proposal-class-properties';
import babelTransformDecorators from '@babel/plugin-proposal-decorators';
import babelTransformExportDefault from '@babel/plugin-proposal-export-default-from';
import babelTransformPrivateMethods from '@babel/plugin-proposal-private-methods';
import babelTransformTypescriptConstEnum from 'babel-plugin-const-enum';
import crypto from 'crypto';
import hqDecoratorMetadata from '@hqjs/babel-plugin-add-decorators-metadata';
import hqExposeGlobalToWindow from '@hqjs/babel-plugin-expose-global-to-window';
import hqPatchAngularCompiler from '@hqjs/babel-plugin-patch-angular-fesm5-compiler';
import hqSupportNodejsGlobals from '@hqjs/babel-plugin-support-nodejs-globals';
import hqTransformCssImport from '@hqjs/babel-plugin-transform-css-imports';
import hqTransformDefine from '@hqjs/babel-plugin-transform-define';
import hqTransformExportAll from '@hqjs/babel-plugin-transform-export-all';
import hqTransformJsonImport from '@hqjs/babel-plugin-transform-json-imports';
import hqTransformMixedImports from '@hqjs/babel-plugin-transform-mixed-imports';
import hqTransformModules from '@hqjs/babel-plugin-transform-modules';
import hqTransformNameImports from '@hqjs/babel-plugin-transform-name-imports';
import hqTransformNamedExportToDestruct from '@hqjs/babel-plugin-transform-named-export-to-destructure';
import hqTransformNamedImportToDestruct from '@hqjs/babel-plugin-transform-named-import-to-destructure';
import hqTransformNamespaceImports from '@hqjs/babel-plugin-transform-namespace-imports';
import hqTransformParameterDecorators from '@hqjs/babel-plugin-transform-parameter-decorators';
import hqTransformPaths from '@hqjs/babel-plugin-transform-paths';
import hqTransformTypescript from '@hqjs/babel-plugin-transform-typescript';
import hqTypeMetadata from '@hqjs/babel-plugin-add-type-metadata';
import path from 'path';
import url from 'url';

const CSS_MODULES_REX = /import\s+[*a-zA-Z_,{}\s]+\s+from\s+['"]{1}([^'"]+\.(css|sass|scss|less))['"]{1}/gm;
const CSS_REQUIRE_MODULES_REX = /=\s*require\s*\(\s*['"]{1}([^'"]+\.(css|sass|scss|less))['"]{1}/gm;

const getPrePlugins = (ctx, skipHQTrans, skipPoly) => {
  const isTSX = ctx.stats.ext === '.tsx';
  const isTS = ctx.stats.ext === '.ts';
  const tsOptions = { legacy: isTS || isTSX };

  if (!isTS && !isTSX) tsOptions.decoratorsBeforeExport = true;

  const prePlugins = [
    [ babelTransformAssetsImport, { extensions: [ '.gif', '.jpeg', '.jpg', '.png', '.svg', '.txt' ] }],
    babelTransformExportDefault,
    [ babelTransformDecorators, tsOptions ],
    hqTransformParameterDecorators,
    [ babelTransformClassProperties, { loose: true }],
    [ babelTransformPrivateMethods, { loose: true }],
    [ hqTransformDefine, {
      // TODO: make it conditional
      'import.meta': { url: pathToURL(ctx.dpath) },
      'process.env.NODE_ENV': 'production',
      'typeof window': 'object',
    }],
    [ babelMinifyDeadCode, { keepClassName: true, keepFnArgs: true, keepFnName: true }],
    [ hqTransformNamespaceImports, { include: [ 'react', 'react-dom' ] }],
    hqTransformNamedExportToDestruct,
    hqTransformExportAll,
    hqTransformModules,
  ];

  // TODO: support nomodule
  // if (ctx.module) {
  //   prePlugins.push(hqTransformModules);
  // }

  if (isTS || isTSX) {
    prePlugins.unshift(
      babelTransformTypescriptConstEnum,
      [ hqTransformTypescript, {
        allowNamespaces: true,
        isTSX,
        jsxPragma: 'React',
        removeUnusedImports: !skipHQTrans,
      }],
      hqTypeMetadata,
      hqDecoratorMetadata,
    );
  }

  if (!skipPoly) {
    prePlugins.unshift(hqSupportNodejsGlobals);
  }

  return prePlugins;
};

const getPlugins = (ctx, skipHQTrans, styleMaps, browser, resolvedDependencies) => {
  if (skipHQTrans) return [];
  const { major: vueVersion } = getVersion(resolvedDependencies);
  const vue = vueVersion === 3 ?
    'vue/dist/vue.esm-browser.js' :
    'vue/dist/vue.esm.js';

  const plugins = [
    hqTransformMixedImports,
    [ hqTransformPaths, {
      basePath: ctx.moduleURL || '',
      baseURI: ctx.store.baseURI,
      dirname: ctx.dirname,
      removeNodeModules: true,
      transformAbsolute: true,
    }],
    [ hqTransformNameImports, {
      browser,
      empty: '/hq-empty-module.js',
      resolve: { vue },
      versions: resolvedDependencies,
    }],
    [ hqTransformNamedImportToDestruct, {
      baseURI: ctx.store.baseURI,
      map: '.map*',
    }],
    [ hqTransformCssImport, { styleMaps }],
    [ hqTransformJsonImport, {
      dirname: ctx.stats.dirname,
      fs: ctx.app.stream ? { readFileSync } : undefined,
      root: ctx.installationPathб,
    }],
    hqExposeGlobalToWindow,
  ];

  if (isAngularCompiler(ctx.dpath)) {
    plugins.unshift(hqPatchAngularCompiler);
  }

  return plugins;
};

const getPresets = (ctx, skipPoly) => {
  const { ua } = ctx.store;
  const isTSX = ctx.stats.ext === '.tsx';
  const isTS = ctx.stats.ext === '.ts';

  const presets = [
    [ babelPresetEnv, {
      bugfixes: true,
      corejs: skipPoly ? undefined : { proposals: true, version: 3 },
      ignoreBrowserslistConfig: false,
      loose: true,
      modules: false,
      shippedProposals: true,
      targets: { browsers: getBrowsersList(ua) },
      useBuiltIns: skipPoly ? false : 'usage',
    }],
  ];
  if (isTSX) {
    presets.push([
      babelPresetReact,
      { development: false, runtime: 'classic' },
    ]);
  }
  if (!isTS && !isTSX) {
    presets.push([
      babelPresetReact,
      { development: false, runtime: 'classic' },
    ], babelPresetFlow);
  }

  return presets;
};

const getPostPresets = (ctx, skipHQTrans) => {
  if (skipHQTrans) return [];

  const postPresets = [[ babelPresetMinify, {
    builtIns: false,
    deadcode: false,
    evaluate: false, // FIXME: https://github.com/babel/minify/issues/986
    mangle: false,
    typeConstructors: !isPolyfill(ctx.dpath),
  }]];

  return postPresets;
};

const getBabelSetup = (ctx, skipHQTrans, styleMaps, browser, resolvedDependencies) => {
  const skipPoly = isPolyfill(ctx.moduleURL) ||
    isWorker(ctx.dpath) ||
    isInternal(ctx.dpath); // || !ctx.module; // TODO: support nomodule

  return {
    plugins: getPlugins(ctx, skipHQTrans, styleMaps, browser, resolvedDependencies),
    postPresets: getPostPresets(ctx, skipHQTrans),
    prePlugins: getPrePlugins(ctx, skipHQTrans, skipPoly),
    presets: getPresets(ctx, skipPoly),
  };
};

const precompileCoffee = async (ctx, content, sourceMap) => {
  const inputContent = CoffeeScript.compile(content, {
    header: false,
    inlineMap: true,
    sourceMap,
  });
  const inputSourceMap = await getInputSourceMap(ctx.srcPath, inputContent);
  return { inputContent, inputSourceMap };
};

/* eslint-disable max-statements, max-depth */
// TODO: refactor
const precompileVue = async (ctx, content, dependencies, devDependencies) => {
  const hash = crypto.createHash('md5')
    .update(ctx.dpath)
    .digest('hex');
  const { major: vueVersion } = getVersion(dependencies, 'vue');
  if (vueVersion === 3) {
    const {
      installRoot,
      registryConf,
      stream,
    } = ctx.app;
    const info = await getInfo('@vue/compiler-sfc', registryConf);
    const { major, minor, patch } = getVersion(devDependencies, '@vue/compiler-sfc');
    const version = `${major}.${minor}.${patch}`;

    const installationPath = await install(info, version, installRoot, stream);
    const { default: Vue } = await import(path.resolve(
      installationPath,
      'dist/compiler-sfc.cjs.js',
    ));
    const { descriptor, errors } = Vue.parse(content, { filename: ctx.dpath, needMap: true });
    if (errors && errors.length > 0) {
      console.error(JSON.stringify(errors));
    }
    let code = '';
    let sourceMap;
    if (descriptor.script || descriptor.scriptSetup) {
      const script = Vue.compileScript(descriptor);
      code += script.content.replace('export default', 'const __vue_component__ =');
      sourceMap = script.map;
    } else code += 'const __vue_component__ = {};';

    let hasScoped = false;
    let hasCSSModules = false;
    if (descriptor.styles) {
      for (const [ index, style ] of descriptor.styles.entries()) {
        // TODO: use postcss config
        const styleCode = await Vue.compileStyleAsync({
          filename: ctx.dpath,
          id: `data-v-${hash}`,
          modules: style.module != null,
          preprocessLang: style.lang,
          scoped: style.scoped != null,
          source: style.content,
        });
        if (styleCode.errors && styleCode.errors.length > 0) {
          console.error(JSON.stringify(styleCode.errors));
        }
        if (style.scoped) hasScoped = true;
        if (style.module) {
          if (!hasCSSModules) {
            code += '\n__vue_component__.__cssModules = {}';
            hasCSSModules = true;
          }
          const modName = typeof style.module === 'string' ? style.module : '$style';
          code += `\n__vue_component__.__cssModules[${JSON.stringify(modName)}] = ${JSON.stringify(styleCode.modules)}`;
        }
        code += `
          const __vue_style__${index} = document.createElement('style');
          __vue_style__${index}.textContent = \`${styleCode.code}\`;
          document.body.appendChild(__vue_style__${index});
        `;
      }
      if (hasScoped) {
        code += `\n__vue_component__.__scopeId = "data-v-${hash}"`;
      }
    }

    if (descriptor.template) {
      const templateCode = Vue.compileTemplate({
        compilerOptions: {
          scopeId: hasScoped ?
            `data-v-${hash}` :
            null,
        },
        filename: ctx.dpath,
        preprocessLang: descriptor.template.lang,
        source: descriptor.template.content,
        transformAssetUrls: false,
      });
      if (templateCode.errors && templateCode.errors.length > 0) {
        console.error(JSON.stringify(templateCode.errors));
      }
      code += `\n${templateCode.code}\n`;
      code += '\n__vue_component__.render = render';
      code += `\n__vue_component__.__file = ${JSON.stringify(ctx.dpath)}`;
      code += '\nexport default __vue_component__';
    }
    return { inputContent: code, inputSourceMap: sourceMap };
  } else {
    // TODO: use compiler from repository
    const { default: Vue } = await import('@vue/component-compiler');
    const compiler = Vue.createDefaultCompiler();
    const descriptor = compiler.compileToDescriptor(ctx.path, content);
    const res = Vue.assemble(compiler, ctx.path, descriptor);
    return { inputContent: res.code, inputSourceMap: res.map };
  }
};
/* eslint-enable max-statements, max-depth */

const precompileSvelte = async (ctx, content) => {
  let scriptIndex = 0;
  let styleIndex = 0;
  // TODO: check svelte version from project package.json
  // TODO: check and add necessary compiller options for svelte version 2
  const {
    installRoot,
    registryConf,
    stream,
  } = ctx.app;
  const info = await getInfo('svelte', registryConf);

  const installationPath = await install(info, '3.31.0', installRoot, stream);
  const { default: svelte } = await import(path.resolve(
    installationPath,
    'svelte/compiler.js',
  ));
  const pre = await svelte.preprocess(content, {
    // TODO: support script preprocessors, do not transform imports
    script({ content: scriptContent, attributes }) {
      const ext = getScriptExtensionByAttrs(attributes);
      if (![ '.ts', '.tsx', '.coffee', '.jsx' ].includes(ext)) return null;
      // TODO: check if sourcemaps can be usefull for inline scripts
      const index = ++scriptIndex;
      return compileJS({
        ...ctx,
        dpath: `${ctx.dpath}-${index}${ext}`,
        moduleURL: ctx.moduleURL,
        path: `${ctx.path}-${index}${ext}`,
        stats: {
          ...ctx.stats,
          ext,
        },
      }, scriptContent, false, { skipHQTrans: true, skipSM: true });
    },
    style({ content: styleContent, attributes }) {
      const ext = getStyleExtensionByAttrs(attributes);
      if (![ '.sass', '.scss', '.less' ].includes(ext)) return null;
      const index = ++styleIndex;
      return compileCSS({
        ...ctx,
        dpath: `${ctx.dpath}$${index}${ext}`,
        moduleURL: ctx.moduleURL,
        path: `${ctx.path}$${index}${ext}`,
        stats: {
          ...ctx.stats,
          ext,
        },
      }, styleContent, false, { skipSM: true });
    },
  });
  const res = svelte.compile(pre.code, {
    filename: ctx.dpath,
    format: 'esm',
    name: path.basename(ctx.dpath, '.svelte'),
  });
  const inputContent = res.js.code;
  const inputSourceMap = res.js.map;
  inputSourceMap.sources[0] = `${ctx.path}.map*`;
  return { inputContent, inputSourceMap };
};

const precompile = async (ctx, content, sourceMap, dependencies, devDependencies) => {
  if (ctx.stats.ext === '.coffee') return precompileCoffee(ctx, content, sourceMap);
  if (ctx.stats.ext === '.vue') return precompileVue(ctx, content, dependencies, devDependencies);
  if (ctx.stats.ext === '.svelte') return precompileSvelte(ctx, content);
  return { inputContent: content, inputSourceMap: sourceMap };
};

const compileCSSModules = async (ctx, content) => {
  const styleImports = [
    ...Array.from(content.matchAll(CSS_MODULES_REX)),
    ...Array.from(content.matchAll(CSS_REQUIRE_MODULES_REX)),
  ];
  const cssModules = styleImports.map(([ , filename ]) =>
    urlToPath(url.resolve(`${pathToURL(ctx.dirname)}/`, filename)));
  const extensions = styleImports.map(([ ,, ext ]) => ext);

  const styleBuilds = cssModules
    .map(async (filename, index) => {
      const fileSrcPath = path.resolve(ctx.app.root, ctx.app.src, filename.slice(1));
      const dpath = pathToURL(filename);
      const { ua } = ctx.store;
      if (ctx.app.table.isDirty(fileSrcPath, ua)) {
        const styleContent = await readFile(fileSrcPath, ctx.app.stream);
        const { code, map } = await compileCSS({
          ...ctx,
          dpath,
          path: dpath,
          srcPath: fileSrcPath,
          stats: { ...ctx.stats, ext: `.${extensions[index]}` },
        }, styleContent, false, { skipSM: ctx.app.build, useModules: true });
        const styleModules = modulesCache.get(fileSrcPath);
        return { code, map, styleModules };
      } else {
        const styleModules = modulesCache.get(fileSrcPath);
        return { styleModules };
      }
    });
  const styles = await Promise.allSettled(styleBuilds);
  return styles
    .filter(({ status }) => status === 'fulfilled')
    .map(({ value: { code, map, styleModules } }, index) => {
      const filename = cssModules[index];
      const dpath = pathToURL(filename);
      const fileSrcPath = path.resolve(ctx.app.root, ctx.app.src, filename.slice(1));
      const { ua } = ctx.store;
      if (ctx.app.table.isDirty(fileSrcPath, ua)) {
        const stats = ctx.app.table.touch(fileSrcPath);
        const styleBuildPromise = saveContent(code, {
          dpath,
          moduleURL: ctx.moduleURL,
          path: dpath,
          stats,
          store: ctx.store,
        });
        stats.build.set(ua, styleBuildPromise);
        if (map) {
          const mapStats = ctx.app.table.touch(`${fileSrcPath}.map`);
          // TODO: add map byte length here
          const mapBuildPromise = saveContent(JSON.stringify(map), {
            dpath: `${dpath}.map`,
            moduleURL: ctx.moduleURL,
            path: `${dpath}.map`,
            stats: mapStats,
            store: ctx.store,
          });
          mapStats.build.set(ua, mapBuildPromise);
        }
      }
      return styleModules;
    })
    .reduce((res, val, index) => {
      const filename = cssModules[index];
      res[filename] = val;
      return res;
    }, {});
};

const compileJS = async (ctx, content, sourceMap, { skipHQTrans = false, skipSM = false } = {}) => {
  const {
    browser,
    devDependencies,
  } = await readPackageJSON(path.resolve(ctx.installationPath, ctx.dirname.slice(1)), ctx.app.stream);
  const resolvedDependencies = await resolveDependencies(ctx.installationPath, ctx.app.resolution, ctx.app.stream);
  const {
    inputContent,
    inputSourceMap,
  } = await precompile(ctx, content, sourceMap, resolvedDependencies, devDependencies);
  const styleMaps = await compileCSSModules(ctx, content);

  const {
    plugins,
    postPresets,
    prePlugins,
    presets,
  } = getBabelSetup(ctx, skipHQTrans, styleMaps, browser, resolvedDependencies);

  const { ast } = await babel.transformAsync(inputContent, {
    ast: true,
    babelrc: false,
    code: false,
    comments: true,
    compact: false,
    configFile: false,
    extends: ctx.app.babelrc,
    filename: ctx.dpath,
    inputSourceMap,
    plugins: prePlugins,
    presets,
    sourceFileName: `${ctx.path}.map*`,
    sourceMaps: !skipSM,
  });

  const { code, map } = await babel.transformFromAstAsync(ast, inputContent, {
    ast: false,
    babelrc: false,
    code: true,
    comments: true,
    compact: false,
    configFile: false,
    filename: ctx.dpath,
    inputSourceMap,
    plugins,
    presets: postPresets,
    sourceFileName: `${ctx.path}.map*`,
    sourceMaps: !skipSM,
  });

  const codeSM = skipSM ? code : `${code}\n//# sourceMappingURL=${ctx.moduleURL}${ctx.dpath}.map`;
  return { code: codeSM, map };
};

export default compileJS;

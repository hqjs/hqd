import fs from 'fs-extra';
import http from 'http';
import path from 'path';
import resolvePackage from 'resolve';
import url from 'url';

export const packageNameRegex = '@[\\w-.]+/[\\w-.]+|[\\w-.]+';

const WORKER_REXP = /(worker|sw)\d*\b/i;

export const HTTP_CODES = {
  INTERNAL_SERVER_ERROR: 500,
  NOT_ACCEPTABLE: 406,
  NOT_FOUND: 404,
  NOT_MODIFIED: 304,
  OK: 200,
};

export const pathToURL = filePath => url.pathToFileURL(filePath).href.slice('file://'.length).replace(/^[a-zA-Z]:/, '');

export const urlToPath = urlPath => path.sep === '\\' ? urlPath.replace(/\//g, '\\') : urlPath;

export const getVersion = (dependencies, name) => {
  if (!dependencies) return {};
  // TODO: resolve with semver
  const version = dependencies[name];
  if (!version) return {};
  const [ major = 0, minor = 0, patch = 0 ] = version.match(/\d+/g);
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
};

const matchesModule = (filePath, module) =>
  filePath.startsWith(`/node_modules/${module}@`) ||
  filePath.startsWith(`/node_modules/${module}/`) ||
  filePath.startsWith(`/${module}@`) ||
  filePath.startsWith(`/${module}/`);

export const isMap = filePath => path.extname(filePath).toLowerCase() === '.map';

// export const isTest = filePath => filePath.startsWith('/test/');

// export const isVendor = filePath => filePath.startsWith('/node_modules/');

export const isPolyfill = filePath => matchesModule(filePath, 'core-js') ||
  matchesModule(filePath, 'buffer') ||
  matchesModule(filePath, 'base64-js') ||
  matchesModule(filePath, 'ieee754') ||
  matchesModule(filePath, 'process') ||
  matchesModule(filePath, 'regenerator-runtime');

export const isInternal = filePath => filePath.includes('/hq-empty-module.js');

export const isWorker = filePath => WORKER_REXP.test(filePath);

export const isDefaultFavicon = filePath => filePath.endsWith('favicon.ico');

export const isAngularCompiler = filePath => filePath.endsWith('compiler/fesm5/compiler.js');

export const isSource = ext => [
  '.pug',
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.js',
  '.jsx',
  '.mjs',
  '.es6',
  '.vue',
  '.svelte',
  '.ts',
  '.tsx',
  '.coffee',
  '.map',
].includes(ext);

export const getResType = ext => {
  switch (ext) {
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.es6':
    case '.vue':
    case '.svelte':
    case '.coffee': return '.js';
    case '.scss':
    case '.sass':
    case '.less': return '.css';
    case '.pug': return '.html';
    default: return ext;
  }
};

export const getModulePath = filepath => `/node_modules/${filepath.split('/node_modules/')[1]}`;

export const readJSONSync = (filePath, def = {}) => {
  try {
    return JSON.parse(fs.readFileSync(filePath), { encoding: 'utf8' });
  } catch {
    return def;
  }
};

const resolveOrModify = (pkgPath, pkg, {
  emptyPath,
  resolve,
  result,
}) => {
  const pkgBasename = pkgPath.slice(0, -path.extname(pkgPath).length);
  if (typeof pkg.browser[pkgPath] === 'string') {
    result.modified = true;
    pkg.main = pkg.browser[pkgPath];
  } else if (typeof pkg.browser[pkgPath] === 'boolean') {
    result.resolved = true;
    resolve(emptyPath);
  } else if (typeof pkg.browser[`./${pkgPath}`] === 'string') {
    result.modified = true;
    pkg.main = pkg.browser[`./${pkgPath}`];
  } else if (typeof pkg.browser[`./${pkgPath}`] === 'boolean') {
    result.resolved = true;
    resolve(emptyPath);
  } else if (typeof pkg.browser[`./${pkgPath}.js`] === 'string') {
    result.modified = true;
    pkg.main = pkg.browser[`./${pkgPath}.js`];
  } else if (typeof pkg.browser[`./${pkgPath}.js`] === 'boolean') {
    result.resolved = true;
    resolve(emptyPath);
  } else if (typeof pkg.browser[`./${pkgBasename}.js`] === 'string') {
    result.modified = true;
    pkg.main = pkg.browser[`./${pkgBasename}.js`];
  } else if (typeof pkg.browser[`./${pkgBasename}.js`] === 'boolean') {
    result.resolved = true;
    resolve(emptyPath);
  }
};

export const resolvePackageFrom = (basedir, dpath, hqroot) => new Promise((resolve, reject) => {
  const emptyPath = path.resolve(hqroot, 'hq-empty-module.js');
  const parts = dpath.split('/node_modules/');
  const modName = parts[parts.length - 1];
  const modPath = modName
    .split('/')
    .slice(1)
    .join('/');
  const modResolve = resolvePackage.isCore(modName) ? `${modName}/` : modName;
  const result = {
    modified: false,
    resolved: false,
  };
  return resolvePackage(
    modResolve, {
      basedir,
      extensions: [
        '.js',
        '.jsx',
        '.mjs',
        '.es6',
        '.vue',
        '.svelte',
        '.ts',
        '.tsx',
        '.coffee',
        '.css',
        '.scss',
        '.sass',
        '.less',
        '.pug',
        '.html',
      ],
      packageFilter(pkg) {
        const { main: pkgMain } = pkg;
        if (pkg.module) pkg.main = pkg.module;
        else if (typeof pkg.exports === 'string') pkg.main = pkg.exports;
        if (typeof pkg.browser === 'string') pkg.main = pkg.browser;
        else if (typeof pkg.browser === 'object' && pkg.browser) {
          if (modPath) {
            resolveOrModify(modPath, pkg, {
              emptyPath,
              resolve,
              result,
            });
          } else if (pkgMain) {
            resolveOrModify(pkgMain, pkg, {
              emptyPath,
              resolve,
              result,
            });
          } else if (pkg.module) {
            resolveOrModify(pkg.module, pkg, {
              emptyPath,
              resolve,
              result,
            });
          }
        }
        return pkg;
      },
      pathFilter(pkg, fullPath, relativePath) {
        return result.modified ? pkg.main : relativePath;
      },
    },
    (err, p) => {
      if (result.resolved) return;
      if (err) reject(err);
      resolve(p);
    },
  );
});

export const getPort = port => new Promise((resolve, reject) => {
  const server = http.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(port, 'localhost', () => server.close(() => resolve(port)));
}).catch(() => getPort(port + 1));

import LRUMap from 'lru-cache';
import NodeCache from 'node-cache';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import gunzip from 'gunzip-maybe';
// FIXME: use registry and other info from .npmrc
import npmFetch from 'npm-registry-fetch';
import path from 'path';
import { readConf } from '../utils.mjs';
import semver from 'semver';
import streamBufferCache from '@hqjs/stream-buffer-cache';
import tar from 'tar-fs';
import tarStream from 'tar-stream';

const Cache = streamBufferCache(LRUMap);

// FIXME: check cache size calculation
const CACHE_SIZE = readConf('cache.npm', 1024 * 1024 * 1024); // 1Gb
const CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 1 month

// TODO: add realpath and lstat implementation for cache content (available during untar)
const cache = new Cache({
  dispose(key) {
    // FIXME: delete directories when entire package is out of cache
    cacheStats.delete(key);
    // FIXME:
    // installation.delete(packageId);
  },
  length(buff) {
    return (buff.metadata && buff.metadata.byteLength) || 0;
  },
  max: CACHE_SIZE,
  maxAge: CACHE_MAX_AGE,
});
const cacheStats = new Map;

const installations = new Map;

const infoCache = new NodeCache({ checkperiod: 300, stdTTL: 180 });

const isTag = version => version !== '' && !/^[0-9]+(\.[0-9]+(\.[0-9]+)?)?$/.test(version);

const shortenPath = header => {
  const index = header.name.indexOf('/');
  if (index !== -1) header.name = header.name.slice(index + 1);
  return header;
};

const ignoreSymlink = (_, { type }) => type === 'link';

// TODO: set registry from configuration
// TODO: add cache option with app root
export const getInfo = async (module, { registry, token }) => {
  if (infoCache.has(module)) return infoCache.get(module);
  const res = await npmFetch.json(`/${module}`, { cache: './test/.cache', registry, token });
  infoCache.set(module, res);
  return res;
};

export const resolveVersion = (info, version = '') => {
  if (version === '') return info['dist-tags'].latest;
  if (isTag(version)) {
    let moduleVersion = info['dist-tags'][version];
    if (moduleVersion === 'latest') moduleVersion = info['dist-tags'].latest;
    if (!moduleVersion) throw new Error(`Package ${info.name} does not have published tag ${version}`);
    return moduleVersion;
  }
  const [ major, minor = 'x', patch = 'x' ] = version.split('.');
  return patch === 'x' ? semver.maxSatisfying(Object.keys(info.versions), `${major}.${minor}.${patch}`) : version;
};

export const resolveVersionPattern = (info, pattern = '*') => {
  // TODO: implement resolution based on configuration patterns
  const versions = Object.keys(info.versions || {});
  return semver.maxSatisfying(versions, pattern);
};

export const priorVersion = version => {
  const [ major, minor, patch ] = version.split('.');
  if (Number(patch)) return `${major}.${minor}.${patch - 1}`;
  if (Number(minor)) return `${major}.${minor - 1}`;
  if (Number(major)) return `${major - 1}`;
  return '';
};

export const resolvePattern = pattern => {
  const version = pattern
    .replace(/(\d+(\.\d+(\.\d+)?)?)-[a-z.\d]+/g, '$1') // FIXME: work with prerelease tags instead of removing them
    .replace('.*', '')
    .replace('.x', '')
    .replace(/>=?\d+(\.\d+(\.\d+)?)?/, '')
    .replace(/^\s+-\s+/, '')
    .replace(/~(\d+(\.\d+)?)(\.\d+)?/, '$1')
    .replace(/\^(\d+)(\.\d+(\.\d+)?)?/, '$1')
    .replace(/<=(\d+(\.\d+(\.\d+)?)?)/, '$1');
  return version.startsWith('<') ?
    priorVersion(version) :
    version;
};

export const resolvePatternSafe = pattern => {
  const resolved = resolvePattern(pattern);
  return resolved || 'latest';
};

export const resolveLockPatternPatch = lockPattern => {
  const [ major, minor ] = lockPattern;
  if (major && minor) return `${major}.${minor}`;
  else if (major) return `${major}`;
  else return 'latest';
};

export const resolveLockPatternMinor = lockPattern => {
  const [ major ] = lockPattern;
  return major || 'latest';
};

export const resolvePatternVersion = (module, resolutionPattern, lockPattern, pattern) => {
  switch (resolutionPattern) {
    case 'l': return lockPattern ?
      `${module}@${lockPattern}` :
      pattern ?
        `${module}@${resolvePatternSafe(pattern)}` :
        `${module}@latest`;
    case 'p': return pattern ?
      `${module}@${resolvePatternSafe(pattern)}` :
      `${module}@latest`;
    case '~': return lockPattern ?
      `${module}@${resolveLockPatternPatch(lockPattern)}` :
      `${module}@${resolveLockPatternPatch(resolvePattern(pattern))}`;
    case '^': return lockPattern ?
      `${module}@${resolveLockPatternMinor(lockPattern)}` :
      `${module}@${resolveLockPatternMinor(resolvePattern(pattern))}`;
    case '*': return `${module}@latest`;
    default: {
      return resolutionPattern ? `${module}@${resolutionPattern}` : module;
    }
  }
};

export const resolveDependencies = async (moduleRoot, resolution, stream) => {
  const resolvedDependencies = {};
  // TODO: cache packageJSON and packageLock for module root
  const { dependencies: lockDependencies = {} } = await readJSON(path.resolve(moduleRoot, 'package-lock.json'));
  const { dependencies = {} } = await readPackageJSON(moduleRoot, stream);
  for (const [ module, pattern ] of Object.entries(dependencies)) {
    const [ namespace ] = module.split('/');
    const resolutionPattern = resolution[module] || resolution[namespace] || resolution['*'];
    const { version: lockPattern } = lockDependencies[module] || {};
    resolvedDependencies[module] = resolvePatternVersion(module, resolutionPattern, lockPattern, pattern);
  }
  return resolvedDependencies;
};

export const resolveMain = (info, version) => {
  const pkgInfo = info.versions[version];
  if (!pkgInfo) throw new Error(`Package ${info.name} does not have published version ${version}`);
  return pkgInfo.module || pkgInfo.main || 'index.js';
};

const True = () => true;
const False = () => false;

export const install = async (info, version, installRoot, stream) => {
  const packageId = `${info.name}@${version}`;

  if (installations.has(packageId)) return installations.get(packageId);

  const installationPath = path.resolve(installRoot, ...info.name.split('/'), version);
  const installationExists = await fs.pathExists(installationPath);
  if (installationExists) {
    const installation = Promise.resolve(installationPath);
    installations.set(packageId, installation);
    return installation;
  }

  const packageURL = info.versions[version].dist.tarball;
  const installation = fetch(packageURL)
    .then(res => {
      const tmpInstallationPath = path.resolve(installRoot, '.tmp', ...info.name.split('/'), version);
      return new Promise((resolve, reject) => {
        if (!stream) {
          res.body
            .pipe(gunzip())
            // TODO: use tar-stream to avoid disk writing
            .pipe(tar.extract(tmpInstallationPath, {
              ignore: ignoreSymlink,
              map: shortenPath,
              readable: true,
            }))
            .on('finish', async () => {
              await fs.move(tmpInstallationPath, installationPath);
              await fs.remove(tmpInstallationPath);
              resolve(installationPath);
            })
            .on('error', async () => {
              installations.delete(packageId);
              await fs.remove(tmpInstallationPath);
              reject();
            });
        } else {
          const extract = tarStream.extract();

          extract.on('entry', (header, str, next) => {
            // header is the tar header
            // stream is the content body (might be an empty stream)
            // call next when you are done with this entry

            const { name } = header;
            const fullName = name.slice('package/'.length);
            const packagePath = `${installationPath}/${fullName}`;

            const stat = {
              ...header,
              isDirectory: False,
              name: header.name.slice('package/'.length),
            };

            str.pipe(cache.set(packagePath));

            str.on('end', () => {
              cacheStats.set(packagePath, stat);
              const dirs = fullName.split('/');
              for (let i = 0; i < dirs.length - 1; i++) {
                const dirname = dirs.slice(0, i + 1).join('/');
                const dir = `${installationPath}/${dirname}`;
                if (!cacheStats.has(dir)) {
                  cacheStats.set(dir, {
                    children: new Set,
                    devmajor: 0,
                    devminor: 0,
                    gid: 0,
                    gname: '',
                    isDirectory: True,
                    linkname: null,
                    mode: 438,
                    mtime: header.mtime,
                    name: dirname,
                    size: 0,
                    type: 'directory',
                    uid: 0,
                    uname: '',
                  });
                }
                const stats = cacheStats.get(dir);
                stats.children.add(dirs[i + 1]);
              }
              const dir = installationPath;
              if (!cacheStats.has(dir)) {
                cacheStats.set(dir, {
                  children: new Set,
                  devmajor: 0,
                  devminor: 0,
                  gid: 0,
                  gname: '',
                  isDirectory: True,
                  linkname: null,
                  mode: 438,
                  mtime: header.mtime,
                  name: dir,
                  size: 0,
                  type: 'directory',
                  uid: 0,
                  uname: '',
                });
              }
              const stats = cacheStats.get(dir);
              stats.children.add(dirs[0]);
              next();
            });

            str.resume();
          });

          extract.on('finish', () => {
            resolve(installationPath);
          });

          extract.on('error', () => {
            installations.delete(packageId);
            reject();
          });

          res.body
            .pipe(gunzip())
            .pipe(extract);
        }
      });
    });

  installations.set(packageId, installation);
  return installation;
};

// export const getInstallationStream = packagePath => {
//   const content = cache.get(packagePath);
//   if (content) return content;
//   // FIXME: install and then get
//   console.error('should install first', packagePath);
//   return null;
// };

// TODO: put file operations into separate service
export const readFile = async (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return new Promise(resolve => {
      const readStream = cache.get(srcPath);
      const data = [];
      readStream.on('data', chunck => {
        data.push(chunck);
      });
      readStream.on('end', () => {
        const content = Buffer.concat(data).toString();
        return resolve(content);
      });
      // console.log(readStream);
      // console.log(readStream.readableBuffer.head.data.toString());
    });
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.readFile(srcPath, { encoding: 'utf8' });
};

export const readBinFile = async (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return new Promise(resolve => {
      const readStream = cache.get(srcPath);
      const data = [];
      readStream.on('data', chunck => {
        data.push(chunck);
      });
      readStream.on('end', () => {
        const content = Buffer.concat(data);
        return resolve(content);
      });
      // console.log(readStream);
      // console.log(readStream.readableBuffer.head.data.toString());
    });
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.readFile(srcPath);
};

export const readFileSync = (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return cache.get(srcPath).readableBuffer.head.data.toString();
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.readFileSync(srcPath, { encoding: 'utf8' });
};

export const realpath = async (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return srcPath;
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.realpath(srcPath);
};

export const lstat = async (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return cacheStats.get(srcPath);
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.lstat(srcPath);
};

export const pathExists = async (srcPath, stream) => stream ?
  cache.has(srcPath) :
  fs.pathExists(srcPath);

export const createReadStream = (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return cache.get(srcPath);
    // FIXME: return default README.md if it doe not exist in repo
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.createReadStream(srcPath);
};

export const readdir = async (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return Array.from(cacheStats.get(srcPath).children);
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.readdir(srcPath);
};

export const stat = async (srcPath, stream) => {
  if (stream) {
    if (cacheStats.has(srcPath)) return cacheStats.get(srcPath);
    throw new Error(`ENOENT: no such file or directory, open ${srcPath}`);
  }
  return fs.stat(srcPath);
};

export const findExistingExtension = async (srcPath, stream) => {
  if (srcPath.endsWith('index') && await pathExists(`${srcPath}.html`)) return '.html';
  else if (await pathExists(`${srcPath}.jsx`, stream)) return '.jsx';
  else if (await pathExists(`${srcPath}.vue`, stream)) return '.vue';
  else if (await pathExists(`${srcPath}.svelte`, stream)) return '.svelte';
  else if (await pathExists(`${srcPath}.mjs`, stream)) return '.mjs';
  else if (await pathExists(`${srcPath}.json`, stream)) return '.json';
  else if (await pathExists(`${srcPath}.ts`, stream)) return '.ts';
  else if (await pathExists(`${srcPath}.tsx`, stream)) return '.tsx';
  else if (await pathExists(`${srcPath}.coffee`, stream)) return '.coffee';
  else if (await pathExists(`${srcPath}.es6`, stream)) return '.es6';
  else if (await pathExists(`${srcPath}.js`, stream)) return '.js';
  else if (await pathExists(srcPath, stream)) return '';
  else if (!srcPath.endsWith('index') && await pathExists(`${srcPath}.html`, stream)) return '.html';
  else throw new Error(`File ${srcPath} not found`);
};

export const getPackageJSONDir = async (dir, stream) => {
  let dirPath = dir;
  while (dirPath !== '/' && !await pathExists(`${dirPath}/package.json`, stream)) {
    dirPath = path.join(dirPath, '..');
  }
  if (!await pathExists(`${dirPath}/package.json`, stream)) return null;
  return dirPath;
};

export const readJSON = async (filePath, stream, def = {}) => {
  try {
    return JSON.parse(await readFile(filePath, stream));
  } catch {
    return def;
  }
};

export const readPackageJSON = async (dir, stream, { search = true } = {}) => {
  const dirPath = search ? await getPackageJSONDir(dir, stream) : dir;
  return readJSON(path.resolve(dirPath, 'package.json'), stream);
};

export const resolvePackageMain = async (dir, stream, { search = false } = {}) => {
  const dirPath = search ? await getPackageJSONDir(dir, stream) : dir;
  const packageJSON = await readPackageJSON(dirPath, stream, { search: false });
  return packageJSON.module || packageJSON.main || `index${await findExistingExtension(`${dirPath}/index`, stream)}`;
};

export const search = async (query, offset, limit, { registry, token }) =>
  npmFetch.json(`/-/v1/search?text=${query}&from=${offset}&size=${limit}`, { cache: './test/.cache', registry, token });

# Smart CDN for npm modules
`hqd` is a smart content delivery network that takes care of building, modularizing and polyfilling the code. It can significantly speed up delivery and improve maintenance processes. Use it to get any file from any package of any verson from `npm` by URL: `https://pkg.hqjs.org/:package@:version/:file`

Note that `https://pkg.hqjs.org` will be changed to your local installation address.

Where
* `:package` - package name including `@namespace` if present
* `:version` - optional package version or dist tag, will be resolved to latest if missing
* `:file` - optional file path, will be resolved to `package.json` module with fallback to main

# Features

* 🔀 Dependencies resolution - rules based dynamic dependenies resolution keeps the product up to date
* 🏷️ Dist tags support - dist tags nicely integrate with the release cycle from dev, through staging, to prod
* 📦 Modules formats - support of different JavaScript module formats: EcmaScript, CommonJS and UMD
* 👩‍💻 Production ready - production ready optimisations, images and code minification, adaptive assets compression
* ☕ Meta languages - precompile meta languages: TypeScript, CofeeScript, J/Tsx, Scss, Sass, Less and Pug
* ⚛️ Frameworks - Angular, React, Vue, Polymer, Svelte and other frameworks are supported natively
* 🧩 Smart polyfills - ships minimum that is required to use cutting edge features even if the client lacks them
* 🚦 Long term cache - uses long term cache to reduce network traffic and speed up assets delivery

# Installation

Install it once with npm
```sh
npm install -g @hqjs/hqd
```

# Usage

The service is using HTTP2 so you need to have HTTPS certificates to run it. Name certificates server.pem and server-key.pem and put them into some folder. Then you can run hqd with the command

```sh
hqd -r ROOT_FOLDER -c CERT_FOLDER -h HOST -p PORT -s
```

where
* `ROOT_FOLDER` - Optional `hqd` working directory, all auxiliary files will be stored in this folder. Default is curent directory `./`.
* `CERT_FOLDER` - Optional certificates folder, where HTTPS certificates are located. Default is `cert` folder inside the `ROOT_FOLDER`.
* `HOST` - Optional host `localhost` or `0.0.0.0` if you want service be available whithin the network. Default is `localhost`.
* `PORT` - Optional port for the service. Default is `10000`.

Flag `-s` - Optional flag for streaming mode. In streaming mode content is not being saved to a disk. Not recommended for production.

Root folder suppose to contain `resolution.json` file described in the Dependencies resolution section below.

Make sure that you have `nodejs >= 12.10.0`.
If problem occurs - please raise an [issue](https://github.com/hqjs/hqd/issues).

# Dependencies resolution
Rules based dynamic dependency resolution allows to keep the product up to date and fix bugs across all related projects. If package version in import URL is not specified explicitlyit will be resolved dynamically based on configuration file `resolution.json` that has records of the following shape:

```js
{
  [pattern]: resolutionKey
}
```

where `pattern` is either package-name (including `@namespace`), `@namespace` (including `@`) or `*` (matches everything) and `resolutionKey` could be one of the following:

* `l` - version specified in `package-lock.json` if present with fall back to `package.json` and then `*`
* `p` - version specified in `package.json` if present with fall back to `*`
* `~` - latest patch version from `package-lock.json` with fall back to best guess from `package.json` then `*`
* `^` - latest minor version from `package-lock.json` with fall back to best guess from `package.json` then `*`
* `*` - latest package version
* `tag` - specific tag version
* `x.y.z` - specific version, where `x`, `y` and `z` - are integers
* `x.y` - latest patch version for minor version `x.y`, where `x` and `y` are integers
* `x` - latest minor version for major version `x`, where `x` is integer

When the best match for specific package is being found it version will be resolved according to resolution key.

# Dist tags support

Dist tags are supported to allign with the release cycle. Release package with the dist-tag following [npm guide](https://docs.npmjs.com/adding-dist-tags-to-packages) and then access it with the link related to your environment
`https://pkg.hqjs.org/:package@:environment/:file`
where real environment is being substituted to the template.

Update dist-tags when new version of the package being released.

# Modules format

Most of the packages on `npm` has CommonJS modules format that is native for node.js. However no browser supports that format, instead browsers understand EcmaScript modules. `hqd` transforms CommonJS into EcmaScript modules that allows the code to work

```js
import { Component } from 'react';
```

Some system modules can be imported as well

```js
import zlib from 'zlib';
```

UMD modules are supported and can be imported as regular EcmaScript modules e.g.

```js
import 'jquery';
```

After that global `$` variable will be available.

# Production ready

All necessary optimisations are done. Enviroment set to production, code and images are optimised and minified, dead code is eliminated, assets are being compressed with the best algorythm available for the browser.

# Meta languages

Meta languages are necessary to create modern web application, they provide shorter syntax, ensure type safety and improve development performance. TypeScript, CofeeScript, Jsx and Tsx that compiles to JavaScript, Scss, Sass, Less that transforms to Css and Pug that become HTML all supported by `hqd`. Together with source maps it looks like this languages are natively working in your browser.

# Frameworks

Angular, React, Vue, Polymer, Svelte and other frameworks are supported natively. There is no need to configure building pipelines for them, just make sure `index.html` has all necessary links to project styles and scripts. For Angular you need additionaly to include early experimental features polyffils to the `main.ts` script:

```ts
import 'core-js/proposals/reflect-metadata';
import 'zone.js/dist/zone';
import 'zone.js/dist/zone-patch-canvas';
```

# Smart polyfills

`hqd` uses `corejs@3` to add polyfills to your code. It determines bare minimum that should be added based on the code usage, making all modern features work across different browsers.

# Long term cache

Uses long term cache to reduce network traffic and speed up assets delivery. Due to nature of npm packages resources are cached as immutable if browser supports it

```
Cache-Control: immutable
```

otherwise one year period is being used. For better effeciency you can use serwice worker, it stores compiled versions of resources on the browser side, automatically clean unused cache and keep your product up to date. Just add installation script on top your html page `index.html`

```js
<script>
  if ('serviceworker' in navigator) {
    navigator.serviceworker.register('/sw.js', { scope: './' }).then(reg => {
      console.log('service worker registration succeeded:', reg);
    }, error => {
      console.log('service worker registration failed:', error);
    });
  }
</script>
```

and create in the root of your project file `sw.js`

```js
const cacheName = 'hqd::https://pkg.hqjs.org';

const PKG = /(https:\/\/pkg\.hqjs\.org\/(@[\w-.]+\/[\w-.]+|[\w-.]+))@([^\/]+)(.*)/;

const isOlder = (a, b) => {
  const [aMaj, aMin = 0, aPatch = 0] = a.split('.').map(x => parseInt(x));
  const [bMaj, bMin = 0, bPatch = 0] = b.split('.').map(x => parseInt(x));
  return aMaj < bMaj ||
    aMaj === bMaj && aMin < bMin ||
    aMaj === bMaj && aMin === bMin && aPatch < bPatch;
}

const fromCacheOrFetch = async req => {
  const cachedResp = await caches.match(req);
  if (cachedResp) return cachedResp;

  const resp = await fetch(req).catch(console.log);
  if (
    !resp ||
    resp.status !== 200 ||
    resp.type !== 'cors' ||
    resp.redirected ||
    !PKG.test(resp.url)
  ) return resp;

  caches
    .open(cacheName)
    .then(async cache => {
      const [, pkgUrl, , pkgVersion, pkgPath] = req.url.match(PKG);
      await cache.keys().then(resps => {
        for (const oldResp of resps) {
          const [, oldPkgUrl, , oldPkgVersion, oldPkgPath] = oldResp.url.match(PKG);
          if (
            oldPkgUrl === pkgUrl &&
            oldPkgPath === pkgPath &&
            isOlder(oldPkgVersion, pkgVersion)
          ) cache.delete(oldResp);
        }
      });

      cache.put(req, resp.clone());
    });

  return resp;
};

self.addEventListener('fetch', ev => ev.respondWith(fromCacheOrFetch(ev.request)));
```

# What about development?

`hqd` is production solution, it suits big distributed projects and allows to follow microservice architecture. It requires no babel or webpack configuration and can significantly speed up delivery and improve support processes. For development stage, please, use [hq](https://hqjs.org) that does not need configuration as well. Together these tools can completely free you from building pipeline configuration routine.

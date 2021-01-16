export default origin => `
const cacheName = 'hqd::${origin}::internal';

const PKG = /(${origin.replace(/\//g, '\\/').replace(/\./g, '\\.')}\\/(@[\\w-.]+\\/[\\w-.]+|[\\w-.]+))@([^\\/]+)(.*)/;
const PUBLIC = /(${origin.replace(/\//g, '\\/').replace(/\./g, '\\.')})\\/-\\/public\\/(.*)/;

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
    !PKG.test(resp.url) ||
    PUBLIC.test(resp.url)
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
`;

// Build-time identifiers are replaced with the exact deployment's fingerprints.
const release = '__BUILD_RELEASE__';
const digests = /* BUILD_ASSET_DIGESTS */ {};
const scope = self.registration.scope;
const prefix = 'hk-equity-shell:' + scope + ':';
const cacheName = prefix + release;
const stateName = 'hk-equity-release:' + scope;
const absolute = name => new URL(name, scope).href;
const pointerURL = absolute('.pwa-approved');
const manifestURL = absolute('.pwa-fingerprints');

async function approvedVersion() {
  const state = await caches.open(stateName);
  return (await state.match(pointerURL))?.text();
}
async function approve(version) {
  const state = await caches.open(stateName);
  await state.put(pointerURL,new Response(version));
}
async function checkedResponse(url, expected, version) {
  const response = await fetch(new Request(url, {cache:'no-store',credentials:'same-origin',redirect:'error'}));
  if (!response.ok) throw Error('Asset unavailable');
  const bytes = await response.clone().arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2,'0')).join('');
  if (actual !== expected) {
    // A private host may append its signed-in shell. The versioned app document must still match.
    const html = url===absolute('index.html') && response.headers.get('content-type')?.includes('text/html');
    const marker = '<meta name="app-release" content="'+version+'">';
    if (!html || !new TextDecoder().decode(bytes).includes(marker)) throw Error('Release content changed');
  }
  return response;
}
self.addEventListener('install', event => event.waitUntil((async () => {
  const entries=Object.entries(digests);
  if (!entries.length) throw Error('Missing release manifest');
  const responses = await Promise.all(entries.map(async ([name,hash]) => {
    const url=absolute(name);
    return [url,await checkedResponse(url,hash,release)];
  }));
  const cache = await caches.open(cacheName);
  await Promise.all(responses.map(([url,response]) => cache.put(url,response)));
  await cache.put(manifestURL,Response.json(digests));
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  let approved = await approvedVersion();
  if (!approved) {
    approved=release;
    await approve(approved);
  }
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName && key !== prefix+approved).map(key => caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  const reply = value => event.ports[0]?.postMessage(value);
  if (event.data?.type === 'VERSION') { reply({release}); return; }
  if (event.data?.type !== 'APPLY_UPDATE') return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if (windows.some(client => client.id !== event.source?.id && client.url.startsWith(scope))) {
      reply({blocked:true});return;
    }
    // This durable choice is independent of automatic service-worker lifecycle transitions.
    await approve(release);
    reply({accepted:true,release});
    await self.skipWaiting();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url=new URL(event.request.url);
  if (!url.href.startsWith(scope)) return;
  url.search='';url.hash='';
  const name = url.href===scope && event.request.mode==='navigate'?'index.html':url.href.slice(scope.length);
  // Do not intercept network data or login. Shell paths are checked against the approved manifest.
  if (!name || name.startsWith('api/') || name.startsWith('.') ||
      (!Object.hasOwn(digests,name) && !/\.(?:js|css|html|png|svg|webp|jpg|woff2?|webmanifest|ico)$/.test(name))) return;
  event.respondWith((async () => {
    const approved = (await approvedVersion())||release;
    const cache=await caches.open(prefix+approved);
    const manifest=approved===release?digests:await (await cache.match(manifestURL))?.json();
    if (!manifest || !Object.hasOwn(manifest,name)) return fetch(event.request);
    const key=absolute(name);
    const saved=await cache.match(key);
    if (saved) return saved;
    try {
      const result=await checkedResponse(key,manifest[name],approved);
      await cache.put(key,result.clone());
      return result;
    } catch {
      return new Response('此版本的離線檔案暫時無法使用，請重新連線並檢查新版。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});

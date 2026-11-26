// Build-time identifiers are replaced with the exact deployment's fingerprints.
const release = "76596757f52a";
const digests = {"app.js":"cc40f196764f5acfc4faf9b24b345f76469a5ef3f53b8e55becaaa4b83b27992","connection.js":"ac3f23b578a825f37ca31d8ad4c9db9a29b42ee28ee9f9ce7797ce7823307092","editor.css":"d716d568f7eb23cb2563079abd7bfec6fd05009a04ce09f0f1acc50caeeb1b7b","editor.js":"8da28df457cbc9587caacec4d1486389e20a9ed3037c21accd22683c9b754cbf","harbour.png":"c9e131366c7ff21efe7ea49f47fe27b641e4b8167a7a6ee331761bd8815c7c22","icon.png":"fb5d7dc9b47c1e46cf4fea5a218ec38ae3bf1908052f9fd07558f2d390927053","index.html":"cfcabb70502ea005f3c19fdf475c2f796b14fc19211ae6c1af03a50b4ce033f4","manifest.webmanifest":"1ec796da326bbdba28ade1c6ea76744928c5a4324368fea9a3ad52a1806a537d","offline.js":"b59665302b4e28802d69cdf54d0b54478cd0b4f51295fe505ab27771e8f6412d","seed.js":"d696d1a888463cd2c260dc82e082163b83d0b09c1e98569c0fad8a85a02a0ddb","style.css":"9d3715bf25c1b4e2d5eb4400826367da6a5cd8fa515fc38565be65e405b595f4","update.css":"2a90f730bfac66b6a5e266dbf0863a83739bb3da6766735cc22cdf488404b7d4","update.js":"6758b84171391214229b07c178e373074b5a27f322c5183bcd0164eeb92f953c","watchlist.css":"b7e38b3741f9f9248395c4a5da143c0ede69ac1583bf5748f049eb9cb0e412e3","watchlist.js":"6b8ea9129e16220181b27fb8d039c860cf20a73aab99239169a881d3b5bb7548"};
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

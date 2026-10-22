const C='ut-v1';const A=['./','index.html','app.js','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 if(u.pathname.endsWith('data.enc.json')){e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const cl=r.clone();caches.open(C).then(c=>c.put(e.request,cl));return r;}).catch(()=>caches.match(e.request)));return;}
 e.respondWith(caches.match(e.request).then(r=>{const f=fetch(e.request).then(n=>{caches.open(C).then(c=>c.put(e.request,n.clone()));return n;}).catch(()=>r);return r||f;}));});

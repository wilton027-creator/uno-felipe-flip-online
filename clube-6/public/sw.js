const CACHE='desvendar-clube6-offline-v6';
const ASSETS=['/','/index.html','/cores.html','/jogo-das-cores.html','/cores-online.html','/triangulo-original.html','/velha-corrida-original.html','/trilha-original.html','/estrela-original.html','/chegada-original.html','/corrida-do-tesouro.html'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('desvendar-clube6-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
const request=event.request;
if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
const path=new URL(request.url).pathname;
if(request.mode==='navigate'){
event.respondWith((async()=>{
const cache=await caches.open(CACHE);
if(path==='/cores.html'||path==='/jogo-das-cores.html'){
const saved=await cache.match(path);
if(saved)return saved;
}
try{
const response=await fetch(request);
if(response.ok&&response.type!=='opaque')cache.put(path,response.clone()).catch(()=>{});
return response;
}catch(error){
return (await cache.match(path))||(await cache.match('/index.html'))||Response.error();
}
})());
}else event.respondWith(caches.match(request).then(saved=>saved||fetch(request)));
});
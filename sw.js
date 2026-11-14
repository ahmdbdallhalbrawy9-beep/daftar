/* يخزّن التطبيق على الموبايل عشان يفتح من غير نت. غيّر رقم النسخة عند أي تحديث. */
var CACHE='daftar-v5';
var FB='https://www.gstatic.com/firebasejs/10.12.2/';
var SDK=[FB+'firebase-app-compat.js',FB+'firebase-auth-compat.js',FB+'firebase-firestore-compat.js'];
var FILES=['./','index.html','manifest.webmanifest','firebase-config.js','icon-192.png','icon-512.png','icon-maskable-512.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return c.addAll(FILES).then(function(){
      return Promise.all(SDK.map(function(u){return c.add(new Request(u,{mode:'no-cors'})).catch(function(){})}));
    });
  }).then(function(){return self.skipWaiting()}));
});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET')return;
  var same=new URL(r.url).origin===self.location.origin;
  if(!same&&SDK.indexOf(r.url)<0)return; /* باقي الطلبات (قاعدة البيانات والدخول) تعدّي عادي */
  e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
    var net=fetch(r).then(function(res){if(res&&(res.ok||res.type==='opaque')){var cp=res.clone();caches.open(CACHE).then(function(c){c.put(r,cp)})}return res}).catch(function(){return hit});
    return hit||net;
  }));
});

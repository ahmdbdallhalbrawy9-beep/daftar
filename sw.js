/* يخزّن التطبيق على الموبايل عشان يفتح من غير نت. غيّر رقم النسخة عند أي تحديث. */
var CACHE='daftar-v21';
var FB='https://www.gstatic.com/firebasejs/10.12.2/';
var SDK=[FB+'firebase-app-compat.js',FB+'firebase-auth-compat.js',FB+'firebase-firestore-compat.js'];
var FILES=['./','index.html','manifest.webmanifest','firebase-config.js','assets/icon-192.png','assets/icon-512.png','assets/icon-maskable-512.png','src/application/auth.js','src/application/backup.js','src/application/closeDay.js','src/application/customers.js','src/application/devices.js','src/application/autoBackup.js','src/domain/drift.js','src/domain/alerts.js','src/domain/limitNotify.js','src/infrastructure/nativeBridge.js','src/domain/reports.js','src/domain/perms.js','src/application/openingCash.js','src/application/ports.js','src/application/settingsUseCases.js','src/application/smsImport.js','src/application/sync.js','src/application/transactions.js','src/application/wallets.js','src/application/wipe.js','src/domain/compute.js','src/domain/customers.js','src/domain/ids.js','src/domain/kinds.js','src/domain/limits.js','src/domain/ledger.js','src/domain/money.js','src/domain/numbers.js','src/domain/plan.js','src/domain/rank.js','src/domain/sms.js','src/domain/time.js','src/domain/wallets.js','src/infrastructure/crypto.js','src/infrastructure/deviceId.js','src/infrastructure/deviceInfo.js','src/infrastructure/download.js','src/infrastructure/firebaseAuth.js','src/infrastructure/firestoreDb.js','src/infrastructure/install.js','src/infrastructure/localDb.js','src/infrastructure/serviceWorker.js','src/infrastructure/smsPlugin.js','src/infrastructure/storage.js','src/infrastructure/writeQueue.js','src/main.js','src/presentation/components/bars.js','src/presentation/components/pendingCard.js','src/presentation/components/pill.js','src/presentation/components/sheet.js','src/presentation/components/toast.js','src/presentation/components/txRow.js','src/presentation/dom.js','src/presentation/formatters.js','src/presentation/router.js','src/presentation/store.js','src/presentation/theme.js','src/presentation/views/customers.js','src/presentation/views/history.js','src/presentation/views/login.js','src/presentation/views/settings.js','src/presentation/views/today.js','src/presentation/views/transaction.js','src/presentation/views/wallets.js','styles/base.css','styles/components.css','styles/layout.css','styles/tokens.css'];
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

var CACHE_NAME = 'db-plan-v1';
var CORE_ASSETS = ['./', './retirement-planner.html', './manifest.webmanifest', './icon-256.png'];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(CORE_ASSETS); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

/* Network-first so you always get the latest version when online; falls back
   to the cached copy so the app still opens with no connection. */
self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then(function(response){
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
      return response;
    }).catch(function(){
      return caches.match(event.request).then(function(cached){
        return cached || caches.match('./retirement-planner.html');
      });
    })
  );
});

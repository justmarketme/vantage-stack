/*
 * VantageStack Consultant Portal — service worker (offline shell + static cache).
 *
 * Registered by hooks/consultant/useServiceWorker.ts as
 *   /consultant-sw.js?v=<build id>   scope "/consultant"
 * and ONLY in production builds (a dev server would fight the cache).
 *
 * Caching strategy
 * - `/_next/static/**`  cache-first. Next content-hashes these files, so a URL
 *   never changes meaning; once cached, Coach Alex's deck (bundled JS) and the
 *   whole portal UI load with no network. Cache name carries the build id.
 * - `/consultant` + `/consultant/*` page navigations  network-first (4s
 *   patience on a slow link), cached per path; offline → that path's cached
 *   copy → the cached `/consultant` shell → a tiny offline page. The pages are
 *   client components that fetch their data from the API, so the HTML is a
 *   shell with no customer data in it.
 * - `/api/**`, any non-GET, any cross-origin request, anything carrying an
 *   Authorization header, RSC payload fetches (`RSC: 1` / `?_rsc=`), and
 *   everything else  never cached: passed straight to the network.
 * - Responses are cached only if they are 200, same-origin ("basic"), not
 *   redirected (a redirect means the session expired → login page) and not
 *   marked `Cache-Control: no-store` by a static asset.
 *
 * Lifecycle
 * - install: precache the shell and the static files it references (best
 *   effort — a failure never blocks install).
 * - activate: delete every older `vs-consultant-*` cache, then claim clients.
 * - message `{ type: "SKIP_WAITING" }`: activate a waiting update now
 *   (the page asks the user first; we never swap code under a live call).
 * - message `{ type: "CLEAR_CACHES" }`: wipe all portal caches (sign-out).
 *
 * The pure routing helpers are exported under CommonJS for unit tests.
 */

/* eslint-disable no-restricted-globals */

var CACHE_PREFIX = "vs-consultant-";
var SHELL_PATH = "/consultant";
var NAV_TIMEOUT_MS = 4000;
var STATIC_MAX_ENTRIES = 300;
var SHELL_MAX_ENTRIES = 40;
var PRECACHE_MAX_ASSETS = 120;

function buildVersion(href) {
  try {
    var v = new URL(href).searchParams.get("v");
    return v && /^[A-Za-z0-9._-]{1,64}$/.test(v) ? v : "0";
  } catch (e) {
    return "0";
  }
}

function cacheNames(version) {
  return { shell: CACHE_PREFIX + "shell-" + version, static: CACHE_PREFIX + "static-" + version };
}

function isPortalPath(pathname) {
  return pathname === SHELL_PATH || pathname.indexOf(SHELL_PATH + "/") === 0;
}

/**
 * Decide how to handle a request. Pure: takes plain fields so tests need no
 * Request polyfill. Returns "static" | "navigate" | "network".
 *   req = { method, url, mode, headers: { get(name) }, origin }
 */
function routeFor(req) {
  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return "network";
  }
  if (req.method !== "GET") return "network";
  if (url.origin !== req.origin) return "network";
  if (url.pathname.indexOf("/api/") === 0 || url.pathname === "/api") return "network";
  if (req.headers && req.headers.get && req.headers.get("authorization")) return "network";
  if (req.headers && req.headers.get && req.headers.get("rsc")) return "network";
  if (url.searchParams.has("_rsc")) return "network";
  if (url.pathname.indexOf("/_next/static/") === 0) return "static";
  if (req.mode === "navigate" && isPortalPath(url.pathname)) return "navigate";
  return "network";
}

/** Is this response safe + useful to keep? */
function isCacheable(res, kind) {
  if (!res || res.status !== 200 || res.type !== "basic" || res.redirected) return false;
  var cc = (res.headers && res.headers.get && res.headers.get("cache-control")) || "";
  if (kind === "static") return !/no-store/i.test(cc);
  var ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
  // Page shells are sent `no-store` by Next (dynamic) — we cache them on purpose,
  // but only real HTML.
  return /text\/html/i.test(ct);
}

/** Cache key for a page: path only (query strings dropped — they can hold ids/search text). */
function navCacheKey(href) {
  var url = new URL(href);
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** `/_next/static/...` URLs referenced by a page's HTML (to precache the shell's JS/CSS). */
function extractStaticAssets(html, origin) {
  var out = [];
  var seen = {};
  var re = /\/_next\/static\/[^"'\s)<>\\]+/g;
  var m;
  while ((m = re.exec(html)) && out.length < PRECACHE_MAX_ASSETS) {
    var u = origin + m[0].replace(/&amp;/g, "&");
    if (!seen[u]) {
      seen[u] = true;
      out.push(u);
    }
  }
  return out;
}

var OFFLINE_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>Offline · VantageStack</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;" +
  "background:#0B0B0C;color:#e5e7eb;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}" +
  "button{margin-top:16px;min-height:44px;padding:0 20px;border-radius:10px;border:0;font:inherit;cursor:pointer}</style></head>" +
  "<body><main><h1 style=\"font-size:20px\">You're offline</h1><p>The portal will open as soon as you have signal.<br>" +
  "Anything you saved is kept on this device and will sync.</p><button onclick=\"location.reload()\">Try again</button></main></body></html>";

// ── Worker wiring (skipped under Node / jest) ───────────────────────────────

if (typeof self !== "undefined" && typeof self.addEventListener === "function" && typeof caches !== "undefined") {
  var VERSION = buildVersion(self.location.href);
  var NAMES = cacheNames(VERSION);
  var DISABLED = VERSION === "dev";

  var trim = function (cacheName, max) {
    return caches.open(cacheName).then(function (cache) {
      return cache.keys().then(function (keys) {
        var extra = keys.length - max;
        if (extra <= 0) return;
        // Cache keys come back in insertion order: drop the oldest.
        return Promise.all(keys.slice(0, extra).map(function (k) { return cache.delete(k); }));
      });
    });
  };

  var putStatic = function (request, res) {
    if (!isCacheable(res, "static")) return Promise.resolve();
    return caches
      .open(NAMES.static)
      .then(function (c) { return c.put(request, res); })
      .then(function () { return trim(NAMES.static, STATIC_MAX_ENTRIES); })
      .catch(function () {});
  };

  var precache = function () {
    var origin = self.location.origin;
    return fetch(SHELL_PATH, { credentials: "same-origin", cache: "no-store" })
      .then(function (res) {
        if (!isCacheable(res, "navigate")) return;
        var copy = res.clone();
        return caches
          .open(NAMES.shell)
          .then(function (c) { return c.put(navCacheKey(origin + SHELL_PATH), copy); })
          .then(function () { return res.text(); })
          .then(function (html) {
            return Promise.all(
              extractStaticAssets(html, origin).map(function (u) {
                return fetch(u, { credentials: "same-origin" })
                  .then(function (r) { return putStatic(u, r); })
                  .catch(function () {});
              }),
            );
          });
      })
      .catch(function () {});
  };

  self.addEventListener("install", function (event) {
    if (DISABLED) return;
    event.waitUntil(precache());
  });

  self.addEventListener("activate", function (event) {
    event.waitUntil(
      caches
        .keys()
        .then(function (keys) {
          return Promise.all(
            keys
              .filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0 && k !== NAMES.shell && k !== NAMES.static; })
              .map(function (k) { return caches.delete(k); }),
          );
        })
        .then(function () { return self.clients.claim(); }),
    );
  });

  self.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "SKIP_WAITING") self.skipWaiting();
    if (data.type === "CLEAR_CACHES") {
      event.waitUntil(
        caches.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; }).map(function (k) { return caches.delete(k); }));
        }),
      );
    }
  });

  var cacheFirst = function (request) {
    return caches.open(NAMES.static).then(function (cache) {
      return cache.match(request).then(function (hit) {
        if (hit) return hit;
        return fetch(request).then(function (res) {
          putStatic(request, res.clone());
          return res;
        });
      });
    });
  };

  var networkFirstPage = function (event) {
    var request = event.request;
    var key = navCacheKey(request.url);
    var fallback = function () {
      return caches.open(NAMES.shell).then(function (cache) {
        return cache.match(key).then(function (hit) {
          return hit || cache.match(navCacheKey(self.location.origin + SHELL_PATH));
        });
      });
    };
    var network = fetch(request).then(function (res) {
      if (isCacheable(res, "navigate")) {
        var copy = res.clone();
        event.waitUntil(
          caches
            .open(NAMES.shell)
            .then(function (c) { return c.put(key, copy); })
            .then(function () { return trim(NAMES.shell, SHELL_MAX_ENTRIES); })
            .catch(function () {}),
        );
      }
      return res;
    });
    // Race the network against a patience timer: on a crawling 3G link show the
    // cached shell after NAV_TIMEOUT_MS (the network copy still refreshes the cache).
    var timer;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () {
        fallback().then(function (hit) { if (hit) resolve(hit); });
      }, NAV_TIMEOUT_MS);
    });
    return Promise.race([
      network.then(function (res) {
        clearTimeout(timer);
        // Server outage (5xx): the cached shell is more useful than an error page.
        if (res.status >= 500) return fallback().then(function (hit) { return hit || res; });
        return res;
      }),
      timeout,
    ]).catch(function () {
      clearTimeout(timer);
      return fallback().then(function (hit) {
        return hit || new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      });
    });
  };

  self.addEventListener("fetch", function (event) {
    if (DISABLED) return;
    var request = event.request;
    var route = routeFor({ method: request.method, url: request.url, mode: request.mode, headers: request.headers, origin: self.location.origin });
    if (route === "static") event.respondWith(cacheFirst(request));
    else if (route === "navigate") event.respondWith(networkFirstPage(event));
    // "network": don't call respondWith — the browser handles it normally, uncached.
  });
}

if (typeof module === "object" && module && module.exports) {
  module.exports = { routeFor: routeFor, isCacheable: isCacheable, navCacheKey: navCacheKey, extractStaticAssets: extractStaticAssets, buildVersion: buildVersion, cacheNames: cacheNames, isPortalPath: isPortalPath, CACHE_PREFIX: CACHE_PREFIX };
}

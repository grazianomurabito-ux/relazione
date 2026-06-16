/* Service worker — Relazione UVM
   Mette in cache il guscio dell'app, il runtime Pyodide e le librerie al primo
   caricamento (con rete); dopo, l'app funziona completamente offline.
   I PDF dei pazienti NON passano mai di qui: vengono elaborati nel browser. */

const VERSIONE = "relazione-uvm-v1";
const CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.4/full/";

// Guscio dell'app: i file locali serviti dall'origine.
const GUSCIO = [
  "./",
  "./index.html",
  "./manifest.json",
  "./template_relazione.docx",
  "./profilo_pai.yaml",
];

// Asset del runtime Pyodide da pre-scaricare (il resto si aggiunge a runtime via fetch).
const PYODIDE_BASE = [
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
].map(f => CDN + f);

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSIONE);
    // Il guscio è obbligatorio; gli asset Pyodide sono best-effort
    // (alcuni nomi possono variare tra versioni: non blocco l'install).
    await c.addAll(GUSCIO);
    await Promise.allSettled(PYODIDE_BASE.map(u =>
      fetch(u, { mode: "cors" }).then(r => r.ok && c.put(u, r.clone()))
    ));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const chiavi = await caches.keys();
    await Promise.all(chiavi.filter(k => k !== VERSIONE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// Strategia: cache-first per guscio e Pyodide (offline-friendly),
// con fallback alla rete e memorizzazione progressiva di ciò che Pyodide scarica.
self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  const gestita = url.startsWith(CDN) ||
                  GUSCIO.some(g => url.endsWith(g.replace("./", "")));
  if (!gestita) return; // tutto il resto: comportamento normale del browser

  e.respondWith((async () => {
    const cache = await caches.open(VERSIONE);
    const hit = await cache.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const rete = await fetch(e.request);
      if (rete.ok && (url.startsWith(CDN) || e.request.method === "GET")) {
        cache.put(e.request, rete.clone());
      }
      return rete;
    } catch (err) {
      // offline e non in cache: lascio fallire in modo esplicito
      return new Response("Risorsa non disponibile offline.", { status: 504 });
    }
  })());
});

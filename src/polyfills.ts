// src/polyfills.ts
// (Angular charge déjà zone.js)
import 'zone.js';

// polyfill "global" attendu par certaines libs CJS (ex: sockjs-client)
declare global {
  interface Window { global: any; process?: any; }
}
// src/polyfills.ts  (tout en haut)
(window as any).global = window as any;
// optionnel selon versions :
(window as any).process = (window as any).process || { env: {} };

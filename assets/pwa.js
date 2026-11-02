(() => {
  'use strict';
  const root = new URL('../', document.currentScript.src);
  const standalone = matchMedia('(display-mode: standalone)');
  const appearance = () => document.documentElement.classList.toggle('pwa-standalone', standalone.matches || navigator.standalone === true);
  appearance(); standalone.addEventListener?.('change', appearance);
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const register = () => navigator.serviceWorker.register(new URL('sw.js', root), { scope: root.pathname, updateViaCache: 'none' }).catch(() => {
    // L'installation peut être désactivée par le navigateur ; le site reste utilisable.
    console.warn('Melaz : le mode installable est temporairement indisponible.');
  });
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
})();

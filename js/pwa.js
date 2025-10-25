// Register service worker and basic PWA hooks
(() => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        await navigator.serviceWorker.register('/service-worker.js');
        console.log('[PWA] Service worker registered');
      } catch (err) {
        console.warn('[PWA] SW registration failed', err);
      }
    });
  }
})();

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>You're offline — Scholio</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100svh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1.5rem;
      padding: 2rem 1.5rem;
      background: #faf8f4;
      color: #1a1714;
      font-family: ui-sans-serif, system-ui, sans-serif;
      text-align: center;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #1c1a18; color: #e8e3db; }
      .icon { color: #5a5248; }
      .btn { background: #2a2724; border-color: #3a3632; color: #b8b0a6; }
      .btn:hover { border-color: #c17b3a; color: #c17b3a; }
    }
    .icon { color: #c5bdb4; }
    h1 {
      font-family: ui-serif, Georgia, serif;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    p {
      font-size: 0.875rem;
      color: #6b6560;
      max-width: 22rem;
      line-height: 1.6;
    }
    @media (prefers-color-scheme: dark) { p { color: #8a8078; } }
    .btn {
      margin-top: 0.5rem;
      padding: 0.5rem 1.25rem;
      border: 1px solid #ddd8d0;
      border-radius: 0.5rem;
      background: #f0ece4;
      color: #3a3530;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn:hover { border-color: #c17b3a; color: #c17b3a; }
  </style>
</head>
<body>
  <svg class="icon" width="48" height="48" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <div>
    <h1>You're offline</h1>
    <p style="margin-top:0.5rem">Check your connection and try again.</p>
  </div>
  <button class="btn" onclick="window.location.reload()">Try again</button>
</body>
</html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(
    fetch(e.request).catch(
      () => new Response(OFFLINE_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      })
    )
  );
});

'use strict';

const { fetchWithTimeout } = require('./util');

// Instance cobalt publik (best-effort, bisa penuh/berubah kapan saja)
const INSTANCES = [
  'https://dwnld.nichind.dev',
  'https://api.dwnld.nichind.dev',
  'https://nyc1.coapi.ggtyler.dev',
  'https://capi.3kh0.net',
  'https://co.otomir23.me',
  'https://cobalt.q444.eu.org',
  'https://cobalt-backend.canine.tools',
];

async function cobaltRequest(instance, payload) {
  const r = await fetchWithTimeout(
    instance + '/',
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    30000
  );
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : {};
  return { status: r.status, data };
}

/**
 * Minta hasil unduh dari instance cobalt publik.
 * Mendukung status tunnel/redirect (satu file) dan picker (banyak file, mis. carousel).
 * Mengembalikan { items: [{ url, type }], source } atau melempar Error.
 */
async function pickDownloads(url, { audioOnly = false } = {}) {
  let lastMsg = '';
  for (const instance of INSTANCES) {
    try {
      const payload = { url, videoQuality: '1080', filenameStyle: 'pretty' };
      if (audioOnly) payload.downloadMode = 'audio';

      const r = await cobaltRequest(instance, payload);
      if (r.status === 429) {
        lastMsg = 'server penuh (rate limit)';
        continue;
      }
      if (r.status === 401 || r.status === 403) {
        lastMsg = 'server membutuhkan API key';
        continue;
      }
      const d = r.data;
      const source = 'cobalt (' + new URL(instance).hostname + ')';
      if (d && (d.status === 'tunnel' || d.status === 'redirect') && d.url) {
        return { items: [{ url: d.url, type: audioOnly ? 'audio' : 'video' }], source };
      }
      if (d && d.status === 'picker' && Array.isArray(d.picker) && d.picker.length) {
        return {
          items: d.picker
            .filter((p) => p && p.url)
            .map((p) => ({ url: p.url, type: p.type === 'photo' ? 'photo' : 'video' })),
          source,
        };
      }
      if (d && d.status === 'error') {
        lastMsg = (d.error && d.error.code) || 'error';
      } else {
        lastMsg = 'respons tidak dikenal';
      }
    } catch (err) {
      lastMsg = err.message;
    }
  }
  throw new Error(lastMsg || 'tidak ada instance yang bisa dihubungi');
}

/**
 * Minta satu tautan unduh dari instance cobalt publik.
 * Mengembalikan { url, source } atau melempar Error dengan pesan sebab terakhir.
 */
async function pickUrl(url, options = {}) {
  const { items, source } = await pickDownloads(url, options);
  if (!items.length) throw new Error('tidak ada media yang dikembalikan');
  return { url: items[0].url, source };
}

module.exports = { pickUrl, pickDownloads };

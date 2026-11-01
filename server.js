'use strict';

const express = require('express');
const path = require('path');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const { DEFAULT_UA } = require('./resolvers/util');
const tiktok = require('./resolvers/tiktok');
const youtube = require('./resolvers/youtube');
const facebook = require('./resolvers/facebook');
const instagram = require('./resolvers/instagram');
const threads = require('./resolvers/threads');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

const RESOLVERS = { tiktok, youtube, facebook, instagram, threads };

app.get('/api/platforms', (req, res) => {
  res.json({
    ok: true,
    platforms: Object.keys(RESOLVERS).map((id) => ({
      id,
      name: RESOLVERS[id].meta.name,
      hosts: RESOLVERS[id].meta.hosts,
    })),
  });
});

app.get('/api/resolve/:platform', async (req, res) => {
  const platform = req.params.platform;
  const url = String(req.query.url || '').trim();

  if (!RESOLVERS[platform]) return res.status(400).json({ ok: false, error: 'Platform tidak dikenal: ' + platform });
  if (!url) return res.status(400).json({ ok: false, error: 'URL masih kosong. Tempel tautan dulu ya.' });

  try {
    const result = await RESOLVERS[platform].resolve(url);
    res.json({ ok: true, platform, ...result });
  } catch (err) {
    res.status(422).json({ ok: false, error: err.message || 'Gagal memproses link.' });
  }
});

// Host privat dilarang lewat proxy (anti-SSRF)
const PRIVATE_HOST = /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?fe80)/i;

// Proxy unduhan: memaksa browser menyimpan file (Content-Disposition: attachment)
app.get('/api/download', async (req, res) => {
  const target = String(req.query.u || '');
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ ok: false, error: 'URL tidak valid' });
  }
  if (!/^https?:$/.test(parsed.protocol) || PRIVATE_HOST.test(parsed.hostname)) {
    return res.status(403).json({ ok: false, error: 'URL tidak diizinkan' });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Referer: parsed.origin,
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
      redirect: 'follow',
    });

    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).json({ ok: false, error: 'Server sumber menolak (HTTP ' + upstream.status + ')' });
    }

    const headers = {};
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
      const v = upstream.headers.get(h);
      if (v) headers[h] = v;
    }
    if (!req.query.inline) {
      const filename =
        String(req.query.filename || '')
          .replace(/[\\/:*?"<>|\r\n]/g, '')
          .trim() || 'download.mp4';
      headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + encodeURIComponent(filename);
      if (!headers['content-type']) headers['content-type'] = 'application/octet-stream';
    }
    res.status(upstream.status).set(headers);
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (err) {
    if (!res.headersSent) res.status(502).json({ ok: false, error: 'Gagal mengambil file: ' + err.message });
    else res.destroy();
  }
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Endpoint tidak ditemukan' }));

// Jalankan server lokal hanya saat dieksekusi langsung.
// Di Vercel, app ini di-export sebagai serverless function (lihat api/index.js).
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('  SosGrab siap dipakai!');
    console.log('  Buka di browser: http://localhost:' + PORT);
    console.log('');
  });
}

module.exports = app;

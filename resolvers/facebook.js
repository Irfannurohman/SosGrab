'use strict';

const { fetchWithTimeout, decodeEscaped, isHttp } = require('./util');
const cobalt = require('./cobalt');

const meta = {
  name: 'Facebook',
  hosts: ['facebook.com', 'fb.watch', 'fb.me'],
};

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const BASIC_UA =
  'Mozilla/5.0 (Linux; U; Android 5.0; en-us) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/43.0 Mobile Safari/537.36';

function isFacebookUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('facebook.com') || h === 'fb.watch' || h.endsWith('fb.watch') || h === 'fb.me';
  } catch {
    return false;
  }
}

// urutan penting: kualitas lebih tinggi dicek lebih dulu
const HD_PATTERNS = [
  /"browser_native_hd_url":"(.*?)"/,
  /"playable_url_quality_hd":"(.*?)"/,
  /"hd_src_no_ratelimit":"(.*?)"/,
  /"hd_src":"(.*?)"/,
];
const SD_PATTERNS = [
  /"browser_native_sd_url":"(.*?)"/,
  /"playable_url":"(.*?)"/,
  /"sd_src_no_ratelimit":"(.*?)"/,
  /"sd_src":"(.*?)"/,
];

function extract(html) {
  const found = {};
  const used = new Set();
  const grab = (patterns, key) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const url = decodeEscaped(m[1]);
        if (url.startsWith('http') && !used.has(url)) {
          used.add(url);
          found[key] = url;
          break;
        }
      }
    }
  };
  grab(HD_PATTERNS, 'hd');
  grab(SD_PATTERNS, 'sd');
  return found;
}

function extractMeta(html) {
  const metaTags = {};
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["'](.*?)["']/i) ||
    html.match(/<meta[^>]+content=["'](.*?)["'][^>]+property=["']og:title["']/i);
  if (title && title[1]) {
    metaTags.title = decodeEscaped(title[1])
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&#039;|&apos;/g, "'")
      .replace(/&amp;/g, '&');
  }
  const image =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["'](.*?)["']/i) ||
    html.match(/<meta[^>]+content=["'](.*?)["'][^>]+property=["']og:image["']/i);
  if (image && image[1]) metaTags.image = decodeEscaped(image[1]);
  return metaTags;
}

function toResult(downloads, metaTags, source) {
  return {
    kind: 'video',
    title: metaTags.title || 'Video Facebook',
    thumbnail: metaTags.image || '',
    duration: 0,
    author: { name: '', handle: '', avatar: '' },
    stats: {},
    downloads,
    ...(source ? { source } : {}),
  };
}

async function resolve(url) {
  if (!isHttp(url)) throw new Error('URL tidak valid.');
  if (!isFacebookUrl(url)) throw new Error('Ini bukan link Facebook. Pilih platform yang benar.');

  // 1) Ambil halaman (ikutkan redirect untuk fb.watch / share link)
  let html = '';
  let finalUrl = url;
  let metaTags = {};
  try {
    const r = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': MOBILE_UA, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' },
      30000
    );
    finalUrl = r.url || url;
    html = await r.text();
    metaTags = extractMeta(html);
  } catch {
    /* lanjut ke fallback cobalt */
  }

  let found = extract(html);

  // 2) Coba mbasic (halaman versi ringan sering membocorkan playable_url)
  if (!found.hd && !found.sd) {
    try {
      const u = new URL(finalUrl);
      const mb = 'https://mbasic.facebook.com' + u.pathname + (u.search || '');
      const r2 = await fetchWithTimeout(
        mb,
        { headers: { 'User-Agent': BASIC_UA, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' },
        30000
      );
      const html2 = await r2.text();
      const found2 = extract(html2);
      found = { hd: found.hd || found2.hd, sd: found.sd || found2.sd };
      if (!metaTags.title) Object.assign(metaTags, extractMeta(html2));
    } catch {
      /* abaikan */
    }
  }

  if (found.hd || found.sd) {
    const downloads = [];
    if (found.hd) downloads.push({ label: 'Video HD', quality: 'HD', ext: 'mp4', url: found.hd });
    if (found.sd) downloads.push({ label: 'Video SD', quality: 'SD', ext: 'mp4', url: found.sd });
    // audio terpisah, best-effort lewat server cobalt
    try {
      const a = await cobalt.pickUrl(url, { audioOnly: true });
      downloads.push({ label: 'Audio saja (MP3)', quality: 'Audio', ext: 'mp3', url: a.url });
    } catch {
      /* audio opsional */
    }
    return toResult(downloads, metaTags, 'halaman Facebook');
  }

  // 3) Facebook sering menutup halaman dengan login-wall → fallback cobalt (video)
  try {
    const v = await cobalt.pickUrl(url);
    const downloads = [{ label: 'Video · kualitas terbaik', quality: 'MP4', ext: 'mp4', url: v.url }];
    try {
      const a = await cobalt.pickUrl(url, { audioOnly: true });
      downloads.push({ label: 'Audio saja (MP3)', quality: 'Audio', ext: 'mp3', url: a.url });
    } catch {
      /* audio opsional */
    }
    return toResult(downloads, metaTags, v.source);
  } catch {
    // 4) Terakhir: bila ada og:image → tawarkan sebagai foto (best-effort)
    if (metaTags.image) {
      return toResult(
        [{ label: 'Foto (kualitas preview)', quality: 'JPG', ext: 'jpg', url: metaTags.image }],
        metaTags,
        'halaman Facebook'
      );
    }
    throw new Error(
      'Tautan video tidak ditemukan. Pastikan video bersifat PUBLIK (bukan privat/hanya-teman) dan link benar. ' +
        'Video Facebook yang butuh login tidak bisa diunduh.'
    );
  }
}

module.exports = { meta, isFacebookUrl, resolve };

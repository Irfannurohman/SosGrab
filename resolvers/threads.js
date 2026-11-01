'use strict';

const { fetchWithTimeout, decodeEscaped, isHttp } = require('./util');

const meta = {
  name: 'Threads',
  hosts: ['threads.net', 'threads.com'],
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function isThreadsUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'threads.net' || h.endsWith('threads.net') || h === 'threads.com' || h.endsWith('threads.com');
  } catch {
    return false;
  }
}

// Tangkap path @user/post/CODE (boleh pakai slug di belakangnya)
function extractPostPath(url) {
  const m = url.match(/threads\.(?:net|com)(\/(?:@[\w.]+\/)?(?:post|reel)\/[\w-]{5,})/i);
  return m ? m[1] : null;
}

async function fetchPage(url, ua) {
  const r = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': ua, 'Accept-Language': 'en-US,en;q=0.9' }, redirect: 'follow' },
    30000
  );
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

function extractFromHtml(html) {
  const out = {};
  const ogImage =
    html.match(/<meta property="og:image" content="([^"]+)"/i) ||
    html.match(/<meta content="([^"]+)" property="og:image"/i);
  const ogVideo =
    html.match(/<meta property="og:video(?::url|:secure_url)?" content="([^"]+)"/i) ||
    html.match(/<meta content="([^"]+)" property="og:video(?::url|:secure_url)?"/i);
  const ogTitle =
    html.match(/<meta property="og:title" content="([^"]*)"/i) ||
    html.match(/<meta property="og:description" content="([^"]*)"/i);

  // JSON state: video_versions (kualitas pertama biasanya tertinggi)
  const vm = html.match(/"video_versions":\[(.*?)\]/s);
  if (vm) {
    const urls = vm[1].match(/"url":"([^"]+)"/g) || [];
    for (const u of urls) {
      const dec = decodeEscaped(u.slice(7, -1));
      if (dec.startsWith('http')) {
        out.video = dec;
        break;
      }
    }
  }

  if (ogVideo) out.video = decodeEscaped(ogVideo[1]).replace(/&amp;/g, '&');
  if (ogImage) out.image = decodeEscaped(ogImage[1]).replace(/&amp;/g, '&');
  if (ogTitle) {
    out.title = decodeEscaped(ogTitle[1])
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .slice(0, 120);
  }
  return out;
}

async function resolve(url) {
  if (!isHttp(url)) throw new Error('URL tidak valid.');
  if (!isThreadsUrl(url)) throw new Error('Ini bukan link Threads. Pilih platform yang benar.');
  const path = extractPostPath(url);
  if (!path) throw new Error('Format link Threads tidak dikenali. Gunakan link post (@user/post/…).');

  const base = 'https://www.threads.com' + path;
  const attempts = [
    { url: base + '/embed', ua: BROWSER_UA },
    { url: base, ua: CRAWLER_UA },
    { url: base + '/embed', ua: CRAWLER_UA },
    { url: base, ua: BROWSER_UA },
  ];

  let found = null;
  for (const a of attempts) {
    try {
      const html = await fetchPage(a.url, a.ua);
      const data = extractFromHtml(html);
      if (data.video || data.image) {
        found = data;
        break;
      }
    } catch {
      /* percobaan berikutnya */
    }
  }

  if (!found || (!found.video && !found.image)) {
    throw new Error(
      'Post Threads tidak berhasil dibaca. Pastikan post PUBLIK dan link benar (@user/post/…). Coba lagi beberapa saat bila server sedang sibuk.'
    );
  }

  const handleMatch = path.match(/@([\w.]+)/);
  const downloads = [];
  if (found.video) {
    downloads.push({ label: 'Video (kualitas sumber)', quality: 'MP4', ext: 'mp4', url: found.video });
  }
  if (found.image) {
    downloads.push({
      label: found.video ? 'Thumbnail (JPG)' : 'Foto (kualitas asli)',
      quality: 'JPG',
      ext: 'jpg',
      url: found.image,
    });
  }

  return {
    kind: found.video ? 'video' : 'photo',
    title: found.title || 'Post Threads',
    thumbnail: found.image || '',
    duration: 0,
    author: { name: handleMatch ? '@' + handleMatch[1] : '', handle: handleMatch ? '@' + handleMatch[1] : '', avatar: '' },
    stats: {},
    downloads,
    source: 'halaman Threads',
  };
}

module.exports = { meta, isThreadsUrl, resolve };

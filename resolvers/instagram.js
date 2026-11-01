'use strict';

const { fetchWithTimeout, isHttp } = require('./util');
const cobalt = require('./cobalt');

const meta = {
  name: 'Instagram',
  hosts: ['instagram.com', 'instagr.am', 'ig.me'],
};

function isInstagramUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('instagram.com') || h === 'instagr.am' || h.endsWith('instagr.am');
  } catch {
    return false;
  }
}

function extractShortcode(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([\w-]{5,})/i);
  return m ? m[1] : null;
}

function friendlyCobaltError(msg) {
  const m = String(msg || '');
  if (m.includes('auth')) return 'server unduhan menolak akses anonim untuk Instagram';
  if (m.includes('no_valid_content')) return 'server tidak menemukan konten yang bisa diunduh';
  if (m.toLowerCase().includes('rate') || m.includes('penuh')) return 'server unduhan sedang penuh';
  return m || 'server unduhan gagal';
}

/**
 * Endpoint media publik Instagram: /p/{kode}/media/?size=l
 * Mengembalikan file langsung (image/jpeg untuk foto, kadang video/mp4).
 * Returns { type, url } atau null bila tidak tersedia.
 */
async function viaMediaEndpoint(shortcode) {
  for (const pathType of ['p', 'reel']) {
    const mediaUrl = 'https://www.instagram.com/' + pathType + '/' + shortcode + '/media/?size=l';
    try {
      const r = await fetchWithTimeout(mediaUrl, { redirect: 'follow' }, 25000);
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      // buang body karena hanya perlu header
      if (r.body) r.body.cancel().catch(() => {});
      if (r.ok && ct.startsWith('image/')) {
        return { type: 'photo', url: mediaUrl };
      }
      if (r.ok && ct.startsWith('video/')) {
        return { type: 'video', url: mediaUrl };
      }
    } catch {
      /* coba varian berikutnya */
    }
  }
  return null;
}

async function resolve(url) {
  if (!isHttp(url)) throw new Error('URL tidak valid.');
  if (!isInstagramUrl(url)) throw new Error('Ini bukan link Instagram. Pilih platform yang benar.');
  const shortcode = extractShortcode(url);
  if (!shortcode) {
    throw new Error('Format link Instagram tidak dikenali. Gunakan link post (/p/) atau reels (/reel/).');
  }

  const isReel = /instagram\.com\/reels?\//i.test(url);

  // 1) Link reels/video: coba server cobalt dulu (kualitas terbaik + audio)
  if (isReel) {
    try {
      const res = await cobalt.pickDownloads(url);
      const many = res.items.length > 1;
      const downloads = res.items.map((d, i) => {
        const isPhoto = d.type === 'photo';
        return {
          label: isPhoto ? (many ? 'Foto ' + (i + 1) : 'Foto') : many ? 'Video ' + (i + 1) : 'Video',
          quality: isPhoto ? 'JPG' : 'MP4',
          ext: isPhoto ? 'jpg' : 'mp4',
          url: d.url,
        };
      });
      // audio terpisah, best-effort
      try {
        const a = await cobalt.pickUrl(url, { audioOnly: true });
        downloads.push({ label: 'Audio saja (MP3)', quality: 'Audio', ext: 'mp3', url: a.url });
      } catch {
        /* audio opsional */
      }
      return {
        kind: downloads.some((d) => d.ext === 'mp4') && !many ? 'video' : 'photo',
        title: 'Reels Instagram',
        thumbnail: '',
        duration: 0,
        author: { name: '', handle: '', avatar: '' },
        stats: {},
        downloads,
        source: res.source,
      };
    } catch {
      /* lanjut ke endpoint media */
    }
  }

  // 2) Endpoint media publik (foto selalu lewat sini; video bila cobalt gagal)
  const media = await viaMediaEndpoint(shortcode);
  if (media) {
    const isPhoto = media.type === 'photo';
    return {
      kind: isPhoto ? 'photo' : 'video',
      title: isPhoto ? 'Post Foto Instagram' : 'Video Instagram',
      thumbnail: isPhoto ? media.url : '',
      duration: 0,
      author: { name: '', handle: '', avatar: '' },
      stats: {},
      downloads: [
        {
          label: isPhoto ? 'Foto (resolusi besar)' : 'Video (kualitas sumber)',
          quality: isPhoto ? 'JPG' : 'MP4',
          ext: isPhoto ? 'jpg' : 'mp4',
          url: media.url,
        },
      ],
      source: 'endpoint media Instagram',
    };
  }

  // 3) Terakhir: cobalt untuk post /p/ yang video (bila langkah 2 memberi gambar gagal total)
  if (!isReel) {
    try {
      const res = await cobalt.pickDownloads(url);
      const downloads = res.items.map((d) => ({
        label: d.type === 'photo' ? 'Foto' : 'Video',
        quality: d.type === 'photo' ? 'JPG' : 'MP4',
        ext: d.type === 'photo' ? 'jpg' : 'mp4',
        url: d.url,
      }));
      return {
        kind: downloads.some((d) => d.ext === 'mp4') ? 'video' : 'photo',
        title: 'Postingan Instagram',
        thumbnail: '',
        duration: 0,
        author: { name: '', handle: '', avatar: '' },
        stats: {},
        downloads,
        source: res.source,
      };
    } catch (err) {
      throw new Error(
        'Post Instagram tidak berhasil diunduh (' +
          friendlyCobaltError(err.message) +
          '). Pastikan post PUBLIK — story, akun private, dan konten yang butuh login tidak didukung. ' +
          'Video/reels kadang perlu 2-3 kali coba karena server unduhan gratisan sering penuh.'
      );
    }
  }

  throw new Error(
    'Reels tidak berhasil diunduh — server unduhan Instagram sedang menolak/penuh. Coba lagi beberapa saat; post foto umumnya tetap bisa diunduh.'
  );
}

module.exports = { meta, isInstagramUrl, resolve };

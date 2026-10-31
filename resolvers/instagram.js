'use strict';

const { isHttp } = require('./util');
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

async function resolve(url) {
  if (!isHttp(url)) throw new Error('URL tidak valid.');
  if (!isInstagramUrl(url)) throw new Error('Ini bukan link Instagram. Pilih platform yang benar.');
  if (!extractShortcode(url)) {
    throw new Error('Format link Instagram tidak dikenali. Gunakan link post (/p/) atau reels (/reel/).');
  }

  // Halaman embed Instagram kini dirender penuh lewat JS (tanpa media di HTML),
  // jadi unduhan diambil lewat server cobalt publik yang mendukung Instagram.
  let res;
  try {
    res = await cobalt.pickDownloads(url);
  } catch (err) {
    throw new Error(
      'Post Instagram tidak bisa diunduh (' +
        err.message +
        '). Pastikan post PUBLIK — akun private, story, dan konten yang butuh login tidak didukung.'
    );
  }

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

  return {
    kind: downloads.some((d) => d.ext === 'mp4') && !many ? 'video' : 'photo',
    title: 'Postingan Instagram',
    thumbnail: '',
    duration: 0,
    author: { name: '', handle: '', avatar: '' },
    stats: {},
    downloads,
    source: res.source,
  };
}

module.exports = { meta, isInstagramUrl, resolve };

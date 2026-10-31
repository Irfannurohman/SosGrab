'use strict';

const { fetchWithTimeout, absUrl, isHttp } = require('./util');

const meta = {
  name: 'TikTok',
  hosts: ['tiktok.com', 'vt.tiktok.com', 'douyin.com'],
};

function isTikTokUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith('tiktok.com') || h.endsWith('douyin.com');
  } catch {
    return false;
  }
}

function mapTikwmError(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('invalid') || m.includes('not found') || m.includes('url')) {
    return 'Link TikTok tidak dikenali. Pastikan link lengkap (bukan halaman profil).';
  }
  if (m.includes('blocked') || m.includes('region')) {
    return 'Video ini diblokir di region server. Coba link lain.';
  }
  return 'Gagal memproses link TikTok (' + (msg || 'unknown') + '). Coba lagi beberapa saat.';
}

async function resolve(url) {
  if (!isHttp(url)) throw new Error('URL tidak valid.');
  if (!isTikTokUrl(url)) throw new Error('Ini bukan link TikTok. Pilih platform yang benar.');

  const body = new URLSearchParams({ url, hd: '1' });
  let json;
  try {
    const r = await fetchWithTimeout(
      'https://www.tikwm.com/api/',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
      30000
    );
    if (!r.ok) throw new Error('HTTP ' + r.status);
    json = await r.json();
  } catch (err) {
    throw new Error(
      err.message.startsWith('HTTP')
        ? 'Server TikTok sedang sibuk / rate-limit. Tunggu sebentar lalu coba lagi.'
        : 'Tidak bisa terhubung ke server TikTok. Periksa koneksi internetmu.'
    );
  }

  if (!json || json.code !== 0 || !json.data) {
    throw new Error(mapTikwmError(json && json.msg));
  }

  const d = json.data;
  const base = 'https://www.tikwm.com';
  const images = Array.isArray(d.images) ? d.images : [];
  const isPhoto = images.length > 0;
  const downloads = [];

  if (isPhoto) {
    // post foto (photo mode / slideshow): semua slide + musiknya
    images.forEach((img, i) => {
      downloads.push({ label: 'Foto ' + (i + 1), quality: 'JPG', ext: 'jpg', url: absUrl(base, img) });
    });
  } else {
    if (d.hdplay)
      downloads.push({ label: 'Video HD · tanpa watermark', quality: 'HD', ext: 'mp4', size: d.hd_size || 0, url: absUrl(base, d.hdplay) });
    if (d.play && d.play !== d.hdplay)
      downloads.push({ label: 'Video SD · tanpa watermark', quality: 'SD', ext: 'mp4', size: d.size || 0, url: absUrl(base, d.play) });
    if (d.wmplay)
      downloads.push({ label: 'Video · dengan watermark', quality: 'SD', ext: 'mp4', url: absUrl(base, d.wmplay) });
  }
  if (d.music)
    downloads.push({ label: isPhoto ? 'Audio / musik post' : 'Audio saja', quality: 'MP3', ext: 'mp3', size: d.music_size || 0, url: absUrl(base, d.music) });

  if (!downloads.length) throw new Error('Video ditemukan, tapi tidak ada tautan unduhan. Coba link lain.');

  return {
    kind: isPhoto ? 'photo' : 'video',
    title: d.title || (isPhoto ? 'Post Foto TikTok' : 'Video TikTok'),
    thumbnail: absUrl(base, isPhoto ? images[0] : (d.origin_cover || d.cover || '')),
    duration: isPhoto ? 0 : (d.duration || 0),
    author: {
      name: (d.author && d.author.nickname) || '',
      handle: d.author && d.author.unique_id ? '@' + d.author.unique_id : '',
      avatar: absUrl(base, (d.author && d.author.avatar) || ''),
    },
    stats: {
      plays: (d.stats && d.stats.play_count) || d.play_count || 0,
      likes: (d.stats && d.stats.digg_count) || d.digg_count || 0,
      comments: (d.stats && d.stats.comment_count) || d.comment_count || 0,
      shares: (d.stats && d.stats.share_count) || d.share_count || 0,
    },
    downloads,
  };
}

module.exports = { meta, isTikTokUrl, resolve };

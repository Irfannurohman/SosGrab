'use strict';

const { execFile } = require('child_process');
const { fetchWithTimeout, isHttp } = require('./util');
const cobalt = require('./cobalt');

const meta = {
  name: 'YouTube',
  hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com', 'music.youtube.com'],
};

const YT_HOSTS = /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

function isYouTubeUrl(url) {
  try {
    return YT_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function extractVideoId(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
  const v = u.searchParams.get('v');
  if (v) return v;
  const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
  return m ? m[1] : null;
}

function hasBinary(cmd, args = ['--version']) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (!settled) {
        settled = true;
        resolve(ok);
      }
    };
    try {
      const p = execFile(cmd, args, { timeout: 8000, windowsHide: true });
      p.on('error', () => done(false));
      p.on('close', (code) => done(code === 0));
    } catch {
      done(false);
    }
  });
}

async function oembed(videoUrl) {
  try {
    const r = await fetchWithTimeout(
      'https://www.youtube.com/oembed?url=' + encodeURIComponent(videoUrl) + '&format=json',
      {},
      15000
    );
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/* ---------- Metode 1: yt-dlp (jika terpasang di PC ini) ---------- */

async function viaYtDlp(url) {
  const raw = await new Promise((resolve, reject) => {
    execFile(
      'yt-dlp',
      ['-J', '--no-warnings', '--no-playlist', url],
      { timeout: 90000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(String(stderr || err.message).slice(0, 300)));
        else resolve(stdout);
      }
    );
  });

  const info = JSON.parse(raw);
  const formats = Array.isArray(info.formats) ? info.formats : [];

  const progressive = formats
    .filter((f) => f.vcodec !== 'none' && f.acodec !== 'none' && f.url && f.protocol === 'https')
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  const seenHeights = new Set();
  const downloads = [];
  for (const f of progressive) {
    if (seenHeights.has(f.height)) continue;
    seenHeights.add(f.height);
    if (seenHeights.size > 4) break;
    downloads.push({
      label: 'Video ' + f.height + 'p' + (f.fps >= 50 ? f.fps : ''),
      quality: f.height + 'p',
      ext: f.ext,
      size: f.filesize || f.filesize_approx || 0,
      url: f.url,
    });
  }

  const bestAudio =
    formats
      .filter((f) => f.vcodec === 'none' && f.acodec !== 'none' && f.url)
      .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))
      .find((f) => f.ext === 'm4a') || null;

  if (bestAudio) {
    downloads.push({
      label: 'Audio saja (m4a)',
      quality: Math.round(bestAudio.abr || 128) + 'kbps',
      ext: 'm4a',
      size: bestAudio.filesize || bestAudio.filesize_approx || 0,
      url: bestAudio.url,
    });
  }

  if (!downloads.length) throw new Error('yt-dlp tidak menemukan format yang bisa diunduh untuk video ini.');

  return {
    kind: 'video',
    title: info.title || 'Video YouTube',
    thumbnail: info.thumbnail || '',
    duration: info.duration || 0,
    author: { name: info.uploader || '', handle: '', avatar: '' },
    stats: { plays: info.view_count || 0, likes: info.like_count || 0 },
    downloads,
    source: 'yt-dlp',
  };
}

/* ---------- Resolver utama ---------- */

async function resolve(url) {
  if (!isHttp(url)) throw new Error('URL tidak valid.');
  if (!isYouTubeUrl(url)) throw new Error('Ini bukan link YouTube. Pilih platform yang benar.');
  const id = extractVideoId(url);
  if (!id) throw new Error('Format link YouTube tidak dikenali. Gunakan link watch, shorts, atau youtu.be.');

  // Metadata untuk UI (oEmbed selalu tersedia)
  const om = await oembed(url);

  // 1) yt-dlp bila ada — paling andal
  if (await hasBinary('yt-dlp')) {
    try {
      return decorate(await viaYtDlp(url), om);
    } catch {
      /* jatuh ke cobalt */
    }
  }

  // 2) cobalt publik
  try {
    const v = await cobalt.pickUrl(url);
    const downloads = [{ label: 'Video · kualitas terbaik', quality: 'MP4', ext: 'mp4', url: v.url }];
    try {
      const a = await cobalt.pickUrl(url, { audioOnly: true });
      downloads.push({ label: 'Audio saja (MP3)', quality: 'Audio', ext: 'mp3', url: a.url });
    } catch {
      /* audio opsional */
    }
    return decorate({ title: 'Video YouTube', downloads, source: v.source }, om);
  } catch (err) {
    throw new Error(
      'Unduhan YouTube sedang tidak tersedia (' +
        err.message +
        '). Solusi paling andal: pasang yt-dlp di PC ini — lihat README.md.'
    );
  }
}

function decorate(r, om) {
  r.kind = 'video';
  if (om) {
    r.title = om.title || r.title;
    r.author = { name: om.author_name || r.author.name || '', handle: '', avatar: '' };
    r.thumbnail = om.thumbnail_url || r.thumbnail || '';
  }
  r.stats = r.stats || {};
  return r;
}

module.exports = { meta, isYouTubeUrl, resolve };

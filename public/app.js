'use strict';

/* ============ SosGrab frontend ============ */

const $ = (s) => document.querySelector(s);
const form = $('#form');
const urlInput = $('#url');
const goBtn = $('#goBtn');
const pasteBtn = $('#pasteBtn');
const errorBox = $('#error');
const loadingBox = $('#loading');
const resultBox = $('#result');
const historyBox = $('#history');
const historyList = $('#historyList');
const toast = $('#toast');
const detectHint = $('#detectHint');
const tabs = document.querySelectorAll('.tab');

let selectedPlatform = 'auto';
let busy = false;

const SVG_DL =
  '<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

/* ---------- helper ---------- */

function detectPlatform(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.endsWith('tiktok.com') || h.endsWith('douyin.com')) return 'tiktok';
    if (h.endsWith('youtube.com') || h === 'youtu.be' || h.endsWith('youtube-nocookie.com')) return 'youtube';
    if (h.endsWith('facebook.com') || h === 'fb.watch' || h === 'fb.me') return 'facebook';
    if (h.endsWith('instagram.com') || h === 'instagr.am' || h.endsWith('instagr.am')) return 'instagram';
    if (h === 'threads.net' || h.endsWith('threads.net') || h === 'threads.com' || h.endsWith('threads.com')) return 'threads';
  } catch { /* bukan URL */ }
  return null;
}

/* ikon kecil bergaya garis (feather) untuk metadata hasil */
const IC = {
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  eye:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  comment:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  person:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
};

function toastMsg(msg, isErr = true) {
  toast.textContent = msg;
  toast.className = 'toast' + (isErr ? ' err' : '');
  clearTimeout(toastMsg._t);
  toastMsg._t = setTimeout(() => toast.classList.add('hidden'), 3800);
}

function fmtDuration(s) {
  if (!s || s < 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

function fmtStats(n) {
  if (!n || n <= 0) return '';
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' M';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' jt';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' rb';
  return String(n);
}

function humanSize(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + units[i];
}

function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'video';
}

function buildFilename(title, platform, d) {
  return `${slugify(title)}-DOWNLOADER-${platform}${d.quality ? '-' + d.quality.replace(/\s+/g, '') : ''}.${d.ext || 'mp4'}`;
}

function showError(msg) {
  errorBox.textContent = '⚠️ ' + msg;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.classList.add('hidden');
}

/* ---------- riwayat (localStorage) ---------- */

const HKEY = 'sosgrab_history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; }
}

function pushHistory(entry) {
  let h = getHistory().filter((x) => x.url !== entry.url);
  h.unshift(entry);
  h = h.slice(0, 12);
  try { localStorage.setItem(HKEY, JSON.stringify(h)); } catch { /* penuh, abaikan */ }
  renderHistory();
}

function renderHistory() {
  const h = getHistory();
  historyBox.classList.toggle('hidden', h.length === 0);
  historyList.innerHTML = '';
  for (const item of h) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.innerHTML = `<span class="dot ${item.platform}"></span><span class="ell"></span>`;
    b.querySelector('.ell').textContent = item.title || item.url;
    b.title = item.url;
    b.addEventListener('click', () => {
      urlInput.value = item.url;
      selectTab(item.platform);
      submit();
    });
    historyList.appendChild(b);
  }
}

$('#clearHistory').addEventListener('click', () => {
  try { localStorage.removeItem(HKEY); } catch { /* abaikan */ }
  renderHistory();
  toastMsg('Riwayat dihapus.', false);
});

/* ---------- tab & deteksi ---------- */

function selectTab(p) {
  selectedPlatform = p;
  document.body.dataset.platform = p;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.platform === p));
  if (p === 'auto') {
    const d = detectPlatform(urlInput.value.trim());
    detectHint.textContent = d
      ? 'Link ' + d + ' terdeteksi ✓ — klik Unduh Sekarang.'
      : 'Tempel link TikTok / YouTube / Facebook / Instagram / Threads — platform terdeteksi otomatis.';
  } else {
    detectHint.textContent = 'Mode manual: ' + p + '. Link di luar ' + p + ' akan ditolak.';
  }
}

tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.platform)));

urlInput.addEventListener('input', () => {
  if (selectedPlatform === 'auto') selectTab('auto');
});

pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      urlInput.dispatchEvent(new Event('input'));
      toastMsg('Link ditempel dari clipboard.', false);
    } else {
      toastMsg('Clipboard kosong.');
    }
  } catch {
    toastMsg('Tidak bisa akses clipboard — tempel manual ya (Ctrl+V).');
  }
  urlInput.focus();
});

/* ---------- resolve ---------- */

form.addEventListener('submit', (e) => {
  e.preventDefault();
  submit();
});

async function submit() {
  if (busy) return;
  const url = urlInput.value.trim();
  clearError();

  if (!url) {
    showError('Link-nya masih kosong. Tempel dulu ya.');
    urlInput.focus();
    return;
  }

  let platform = selectedPlatform;
  if (platform === 'auto') {
    const d = detectPlatform(url);
    if (!d) {
      showError('Link tidak dikenali. Pakai link TikTok, YouTube, atau Facebook — atau pilih tab platform dulu.');
      return;
    }
    platform = d;
    selectTab(platform);
    detectHint.textContent = 'Link ' + platform + ' terdeteksi otomatis ✓ — pilih versi unduhan di bawah.';
  }

  busy = true;
  goBtn.disabled = true;
  loadingBox.classList.remove('hidden');
  resultBox.classList.add('hidden');
  resultBox.innerHTML = '';

  try {
    const r = await fetch(`/api/resolve/${platform}?url=${encodeURIComponent(url)}`);
    const data = await r.json();
    if (!r.ok || !data.ok) {
      throw new Error(data.error || 'Server gagal memproses link.');
    }
    renderResult(data, platform, url);
    pushHistory({ url, platform, title: data.title, ts: Date.now() });
  } catch (err) {
    showError(err.message);
    loadingBox.classList.add('hidden');
  } finally {
    busy = false;
    goBtn.disabled = false;
  }
}

/* ---------- render hasil ---------- */

function avatarHtml(author) {
  const ph = `<div class="result-avatar ph">${IC.person}</div>`;
  if (author && author.avatar) {
    return `<span class="avatar-stack">${ph}<img class="result-avatar" src="/api/download?u=${encodeURIComponent(author.avatar)}&inline=1" alt="" onerror="this.remove()"></span>`;
  }
  return ph;
}

function renderResult(r, platform, sourceUrl) {
  loadingBox.classList.add('hidden');
  document.body.dataset.platform = platform;

  const thumb = r.thumbnail
    ? `<img class="result-thumb${r.kind === 'photo' ? ' portrait' : ''}" src="/api/download?u=${encodeURIComponent(r.thumbnail)}&inline=1" alt="thumbnail" onerror="this.style.visibility='hidden'">`
    : `<div class="result-thumb"></div>`;

  const meta = [];
  if (r.duration) meta.push(`<span>${IC.clock} <b>${fmtDuration(r.duration)}</b></span>`);
  if (r.stats) {
    if (r.stats.plays) meta.push(`<span>${IC.eye} <b>${fmtStats(r.stats.plays)}</b> tayangan</span>`);
    if (r.stats.likes) meta.push(`<span>${IC.heart} <b>${fmtStats(r.stats.likes)}</b></span>`);
    if (r.stats.comments) meta.push(`<span>${IC.comment} <b>${fmtStats(r.stats.comments)}</b></span>`);
  }

  const byline = [];
  if (r.author && r.author.name) byline.push(`<div class="byline-name">${escapeHtml(r.author.name)}</div>`);
  if (r.author && r.author.handle) byline.push(`<div class="byline-handle">${escapeHtml(r.author.handle)}</div>`);

  const downloads = (r.downloads || []).map((d, i) => {
    const name = buildFilename(r.title || 'video', platform, d);
    const href = `/api/download?u=${encodeURIComponent(d.url)}&filename=${encodeURIComponent(name)}`;
    const sub = [d.quality, d.ext ? String(d.ext).toUpperCase() : '', d.size ? humanSize(d.size) : '']
      .filter(Boolean)
      .join(' · ');
    return `<a class="dl-btn${i === 0 ? ' primary' : ''}" href="${href}">
      <span class="dl-icon">${SVG_DL}</span>
      <span class="dl-meta"><b>${escapeHtml(d.label)}</b>${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</span>
    </a>`;
  }).join('');

  resultBox.innerHTML = `
    <div class="card">
      ${thumb}
      <div class="result-body">
        <div class="result-title">${escapeHtml(r.title || 'Video')}</div>
        <div class="result-byline">${avatarHtml(r.author)}<div>${byline.join('')}</div></div>
        ${meta.length ? `<div class="result-meta">${meta.join('')}</div>` : ''}
        <div class="dl-list">${downloads || '<p class="hint">Tidak ada pilihan unduhan untuk video ini.</p>'}</div>
        ${r.source ? `<div class="src-note">Sumber unduhan: ${escapeHtml(r.source)}</div>` : ''}
      </div>
    </div>`;
  resultBox.classList.remove('hidden');
  resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------- init ---------- */
renderHistory();

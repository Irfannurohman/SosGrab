'use strict';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'User-Agent': DEFAULT_UA, ...(options.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

// Facebook menyematkan URL dengan escape ala JSON (\u0025 dst).
function decodeEscaped(s) {
  try {
    return JSON.parse('"' + s.replace(/"/g, '\\"') + '"');
  } catch {
    return s;
  }
}

function absUrl(base, u) {
  if (!u) return '';
  if (u.startsWith('http')) return u;
  return base.replace(/\/$/, '') + '/' + u.replace(/^\//, '');
}

function isHttp(url) {
  try {
    return /^https?:$/.test(new URL(url).protocol);
  } catch {
    return false;
  }
}

module.exports = { DEFAULT_UA, fetchWithTimeout, decodeEscaped, absUrl, isHttp };

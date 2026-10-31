# SosGrab — Sosmed Video Downloader

Downloader video **TikTok**, **YouTube**, **Facebook**, dan **Instagram** dengan UI sendiri (dark, glassmorphism, ikon resmi tiap platform) — terinspirasi situs sejenis seperti fastdl.app tapi desain dan kodenya dibuat dari nol.

## Fitur

- ✅ **TikTok** — video HD/SD tanpa watermark, video dengan watermark, post foto (semua slide), dan audio MP3
- ✅ **YouTube** — unduh video (via server pintu masuk publik / yt-dlp) + audio m4a
- ✅ **Facebook** — video publik HD/SD (termasuk link `fb.watch`, reels, watch, share)
- ✅ **Instagram** — reels & video post publik; post foto best-effort (tergantung server)
- ✅ Deteksi platform otomatis dari link
- ✅ Riwayat link di browser (localStorage, bisa dihapus)
- ✅ Proxy unduhan agar file tersimpan langsung (bukan diputar di browser)

## Cara menjalankan

```bash
npm install
npm start
```

Lalu buka **http://localhost:3000**

> Butuh Node.js 18+ (di PC ini sudah ada Node 26).

## Catatan penting soal YouTube

YouTube membatasi unduhan dari luar, jadi metode tanpa API key sering gagal/kena rate-limit. Urutan metode yang dipakai SosGrab:

1. **yt-dlp** (jika terpasang di PC ini) — paling andal. Pasang dengan:
   ```
   winget install yt-dlp
   ```
   atau `pip install yt-dlp`. Tidak perlu restart — SosGrab otomatis memakainya begitu ada di PATH.
2. **Instance cobalt publik** — best-effort, sering penuh.

TikTok dan Facebook tidak butuh tambahan apa pun.

## Struktur proyek

```
sosmed donwloader/
├── server.js            # Express: API resolve + proxy unduhan
├── resolvers/
│   ├── tiktok.js        # API tikwm (no-watermark)
│   ├── youtube.js       # yt-dlp → fallback cobalt publik
│   ├── facebook.js      # scraping halaman publik → fallback cobalt
│   ├── instagram.js     # reels/video publik via cobalt (multi-file didukung)
│   ├── cobalt.js        # modul bersama: server cobalt publik
│   └── util.js
└── public/              # frontend (vanilla HTML/CSS/JS, ikon SVG resmi, logo.png SG Neon)
```

## Batasan yang wajar

- Video Facebook **privat/hanya-teman** tidak bisa diunduh (butuh login).
- Instagram: hanya **reels/video post publik**; akun private, story, dan foto post sering ditolak server unduhan.
- Endpoint publik bisa berubah kapan saja; kalau satu platform macet, tunggu atau pasang yt-dlp.
- Endpoint tikwm punya batas rate — kalau kena, tunggu sebentar.

## Disclaimer

Alat ini independen dan tidak berafiliasi dengan TikTok, YouTube, atau Meta.
Gunakan hanya untuk konten milikmu sendiri atau yang kamu punya izin untuk mengunduhnya. Hormati ketentuan layanan setiap platform.

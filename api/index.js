/**
 * Gemini Gateway — proxy ringan ke Gemini API (generativelanguage.googleapis.com).
 * Semua path, query, dan body diteruskan apa adanya; API key di-inject di server.
 */
const express = require('express');
const fs = require('fs');
const { Readable } = require('stream');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

// Muat .env hanya untuk local dev (di Vercel pakai Environment Variables dashboard).
if (!process.env.VERCEL && fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const app = express();

// CORS terbuka supaya bisa dipanggil dari browser mana pun.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-key, x-proxy-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Health check.
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'gemini-gateway', target: GEMINI_BASE });
});

// Proxy semua request lain ke Gemini API.
app.all('*', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: { code: 500, message: 'GEMINI_API_KEY belum di-set di environment.' } });
  }

  // Proteksi opsional: kalau PROXY_KEY diisi, client wajib kirim header x-proxy-key yang sama.
  if (process.env.PROXY_KEY && req.get('x-proxy-key') !== process.env.PROXY_KEY) {
    return res.status(401).json({ error: { code: 401, message: 'Unauthorized (x-proxy-key tidak valid).' } });
  }

  // Susun URL target: path + query dari client (API key selalu diambil dari server).
  const target = new URL(req.path, GEMINI_BASE);
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'key' || key === 'proxyKey') continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      target.searchParams.append(key, typeof v === 'string' ? v : JSON.stringify(v));
    }
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': req.get('content-type') || 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: Buffer.isBuffer(req.body) && req.body.length > 0 ? req.body : undefined,
    });

    res.status(upstream.status);
    res.set('Content-Type', upstream.headers.get('content-type') || 'application/json');

    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body);
      stream.on('error', () => res.end());
      stream.pipe(res); // di-stream, jadi SSE (alt=sse) ikut bekerja normal
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({ error: { code: 502, message: 'Gagal menghubungi Gemini API.', detail: String((err && err.message) || err) } });
  }
});

module.exports = app;

// Jalankan server hanya saat local dev (di Vercel otomatis sebagai serverless function).
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`gemini-gateway siap di http://localhost:${port}`));
}

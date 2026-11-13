# Gemini Gateway (Vercel)

Proxy ringan ke Gemini API (`generativelanguage.googleapis.com`), dibuat untuk melewati blokir region: fungsi berjalan di Vercel (region US), lalu meneruskan semua request ke Gemini.

## Cara kerja

- Semua path, query, dan body diteruskan apa adanya.
  `https://<project>.vercel.app/v1beta/models` → `https://generativelanguage.googleapis.com/v1beta/models`
- API key Gemini disimpan aman di server (environment variable) dan di-inject lewat header `x-goog-api-key`. Param `?key=` dari client diabaikan.
- Response di-stream, jadi `streamGenerateContent?alt=sse` tetap bekerja normal.
- CORS terbuka, bisa dipanggil langsung dari browser.
- Opsional: set `PROXY_KEY` supaya gateway hanya bisa dipakai yang tahu kuncinya (header `x-proxy-key`).

## Struktur

```
api/index.js   -> app Express (entry serverless function Vercel)
vercel.json    -> routing ke api/index.js, region iad1 (US), maxDuration 60s
env.example    -> daftar environment variable yang dibutuhkan
```

## Jalankan di local

```bash
npm install
copy env.example .env     # Windows (di Linux/Mac: cp env.example .env)
# isi GEMINI_API_KEY di file .env
npm start                 # jalan di http://localhost:3000
```

## Deploy ke Vercel (sekali setup)

1. Push repo ini ke GitHub.
2. Di [vercel.com](https://vercel.com): **Add New → Project → Import** repo tadi.
3. Framework preset **Other** (biarkan default, tidak perlu build command).
4. **Environment Variables** — tambah:

   | Name | Wajib? | Keterangan |
   |---|---|---|
   | `GEMINI_API_KEY` | wajib | API key dari https://aistudio.google.com/apikey |
   | `PROXY_KEY` | opsional | Kunci tambahan untuk membatasi akses ke gateway |

5. Klik **Deploy**.

Setelah itu, setiap push ke branch utama otomatis deploy versi baru.
Endpoint Anda: `https://<project>.vercel.app` — pakai persis seperti endpoint Gemini biasa, tinggal ganti host-nya.

## Contoh pemakaian

### List model

```bash
curl https://<project>.vercel.app/v1beta/models
```

### generateContent

```bash
curl https://<project>.vercel.app/v1beta/models/gemini-2.5-flash:generateContent \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Halo!"}]}]}'
```

### Streaming (SSE)

```bash
curl -N "https://<project>.vercel.app/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Halo!"}]}]}'
```

Jika `PROXY_KEY` di-set, tambahkan header `-H "x-proxy-key: <nilainya>"` di semua request.

### Dari Google GenAI SDK (JavaScript)

```js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: "dummy", // tidak terpakai — server yang menyuntik key asli
  httpOptions: {
    baseUrl: "https://<project>.vercel.app",
    headers: { "x-proxy-key": "<PROXY_KEY>" }, // hapus baris ini jika PROXY_KEY tidak dipakai
  },
});
```

## Catatan batasan

- Body request maksimal ±4.5 MB (batas Vercel). Untuk upload file besar, lakukan di luar gateway.
- Maksimal 60 detik per request (batas plan Hobby Vercel); streaming sangat panjang bisa terpotong.

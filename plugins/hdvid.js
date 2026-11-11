const axios = require('axios')

// ================= CONFIG API =================
const API_BASE = 'https://api-faa.my.id/faa'
const REQUEST_URL = `${API_BASE}/hdvid`   // POST multipart (field: url) / GET ?url=...
const RESULT_URL = `${API_BASE}/result`   // GET ?id=<job_id> → polling hasil
const POLL_INTERVAL = 5000                // jeda antar polling (ms) — hormati rate limit API (4 token, refill 1/5s)
const MAX_WAIT = 180000                   // maksimal menunggu job selesai (3 menit)
// ============================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extractUrl(text) {
  if (!text) return null
  const match = text.match(/https?:\/\/\S+/i)
  return match ? match[0] : null
}

// Ambil field URL video dari respons API yang bentuknya bisa bervariasi
function pickVideoUrl(result) {
  if (!result) return null
  if (typeof result === 'string') return /^https?:\/\//.test(result) ? result : null
  const candidates = [
    result.dl_url, result.download_url, result.url_download, result.link,
    result.url, result.video, result.hd, result.full, result.result,
  ]
  for (const c of candidates) {
    const u = pickVideoUrl(c)
    if (u) return u
  }
  if (Array.isArray(result)) {
    for (const item of result) {
      const u = pickVideoUrl(item)
      if (u) return u
    }
  }
  return null
}

async function sendMedia(sock, senderJid, msg, url, caption) {
  try {
    await sock.sendMessage(senderJid, {
      video: { url },
      caption,
      mimetype: 'video/mp4',
    }, { quoted: msg })
    return true
  } catch (err) {
    console.error('⚠️ Kirim video gagal via buffer URL, coba cara kedua:', err.message)
  }
  try {
    const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxContentLength: 512 * 1024 * 1024 })
    await sock.sendMessage(senderJid, {
      video: Buffer.from(data),
      caption,
      mimetype: 'video/mp4',
    }, { quoted: msg })
    return true
  } catch (err) {
    console.error('❌ Download video hasil gagal:', err.message)
    return false
  }
}

module.exports = {
  name: 'hdvid',
  command: ['.hdvid'],
  ownerOnly: true,
  description: 'Download video HD tanpa watermark (TikTok/IG dll) via api-faa.my.id',

  execute: async (ctx) => {
    const { sock, msg, args, senderJid } = ctx
    const input = args.join(' ').trim()
    let link = extractUrl(input)

    // Jika tidak ada link di teks, cek pesan yang di-reply (media yang dikirim user → upload dulu)
    if (!link) {
      return await sock.sendMessage(
        senderJid,
        { text: '❌ Masukkan link video!\nContoh: `.hdvid https://vt.tiktok.com/xxxx`\nAtau reply video yang mau di-download.' },
        { quoted: msg }
      )
    }

    try {
      await sock.sendMessage(senderJid, { text: '⏳ Mengirim link ke server hdvid...' }, { quoted: msg })

      // ===== STEP 1: "Upload" link ke API =====
      // Catatan: endpoint ini hanya menerima GET ?url=... (POST diblokir Cloudflare 403)
      const submit = await axios.get(REQUEST_URL, {
        params: { url: link },
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' },
        timeout: 60000,
        validateStatus: () => true,
      })

      const sub = (typeof submit.data === 'object' && submit.data) ? submit.data : {}
      if (!sub.status && !sub.job_id) {
        return await sock.sendMessage(
          senderJid,
          { text: `❌ Permintaan ditolak server: ${sub.error || submit.statusText || 'Unknown error'}\n\n_Contoh penggunaan: .hdvid <link>_` },
          { quoted: msg }
        )
      }

      // Beberapa API langsung mengembalikan hasil (bukan async job)
      let videoUrl = pickVideoUrl(sub.result)

      // ===== STEP 2: Polling hasil job (async) =====
      if (!videoUrl && sub.job_id) {
        const deadline = Date.now() + MAX_WAIT
        let noteSent = false
        while (Date.now() < deadline) {
          await sleep(POLL_INTERVAL)
          if (!noteSent) {
            noteSent = true
            await sock.sendMessage(senderJid, { text: `⏳ Proses berjalan... (job: ${sub.job_id})` }, { quoted: msg }).catch(() => {})
          }
          const poll = await axios.get(`${RESULT_URL}?id=${encodeURIComponent(sub.job_id)}`, {
            timeout: 30000,
            validateStatus: () => true,
          }).catch(() => null)

          const rd = poll?.data || {}
          if (rd.status === true || rd.state === 'completed' || rd.state === 'success' || rd.state === 'done') {
            videoUrl = pickVideoUrl(rd.result || rd.data || rd)
            break
          }
          if (rd.state === 'failed' || rd.status === false && rd.error && rd.state !== 'processing' && rd.state !== 'pending' && rd.state !== 'queued') {
            return await sock.sendMessage(
              senderJid,
              { text: `❌ Proses gagal di server: ${rd.error || 'Unknown error'}\n_Coba lagi beberapa saat atau gunakan link lain._` },
              { quoted: msg }
            )
          }
        }
      }

      if (!videoUrl) {
        return await sock.sendMessage(
          senderJid,
          { text: '⌛ Melebihi batas waktu tunggu. Video belum siap, coba lagi nanti.' },
          { quoted: msg }
        )
      }

      // ===== STEP 3: Kirim videonya =====
      await sock.sendMessage(senderJid, { text: '📥 Video siap, mengirim...' }, { quoted: msg }).catch(() => {})
      const ok = await sendMedia(sock, senderJid, msg, videoUrl, `🎬 *HD VIDEO*\n🔗 ${link}\n🤖 by Faa API`)
      if (!ok) {
        await sock.sendMessage(
          senderJid,
          { text: `⚠️ Gagal mengirim file, ini link langsungnya:\n${videoUrl}` },
          { quoted: msg }
        )
      }
    } catch (err) {
      console.error('❌ [HDVID ERROR]:', err.message)
      await sock.sendMessage(
        senderJid,
        { text: '❌ Terjadi kesalahan saat menghubungi server hdvid.' },
        { quoted: msg }
      )
    }
  },
}

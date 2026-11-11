const axios = require('axios')

module.exports = {
  name: 'AI Text to Image',
  command: ['.aiimg'],
  ownerOnly: true,
  description: 'Buat gambar',
  
  execute: async (ctx) => {
    const { sock, msg, args, senderJid } = ctx
    const prompt = args.join(' ')

    if (!prompt) {
      return await sock.sendMessage(
        senderJid,
        { text: '❌ Harap masukkan prompt!\nContoh: `.aiimg A futuristic cyberpunk city at night`' },
        { quoted: msg }
      )
    }

    try {
      await sock.sendMessage(senderJid, { text: '⏳ Sedang membuat gambar, mohon tunggu sebentar...' }, { quoted: msg })

      const apiUrl = `https://api-faa.my.id/faa/ai-text2img-pro?prompt=${encodeURIComponent(prompt)}`

      // Mengambil langsung biner gambar dari endpoint
      const response = await axios.get(apiUrl, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(response.data)

      // Mengirimkan buffer gambar ke WhatsApp
      await sock.sendMessage(
        senderJid,
        { 
          image: buffer, 
          caption: `✅ Berhasil menghasilkan gambar untuk prompt:\n"${prompt}"` 
        },
        { quoted: msg }
      )

    } catch (err) {
      console.error('❌ [AI-IMG ERROR]:', err.message)
      await sock.sendMessage(
        senderJid,
        { text: '❌ Gagal menghasilkan gambar. Terjadi kesalahan pada server API.' },
        { quoted: msg }
      )
    }
  }
}

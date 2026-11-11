const axios = require('axios')

module.exports = {
  name: 'AI Bard / Google',
  command: ['.gemini'], // Pilihan command yang bisa digunakan
  ownerOnly: true, // Ubah ke true jika hanya ingin owner yang bisa pakai
  description: 'Tanyakan gemini',
  
  execute: async (ctx) => {
    const { sock, msg, args, senderJid } = ctx
    const query = args.join(' ')

    if (!query) {
      return await sock.sendMessage(
        senderJid,
        { text: '❌ Harap masukkan pertanyaan!\nContoh: `.ai Halo, siapa penemu lampu?`' },
        { quoted: msg }
      )
    }

    try {
      await sock.sendMessage(senderJid, { text: '⏳ Sedang memproses pertanyaan...' }, { quoted: msg })

      const apiUrl = `https://api-faa.my.id/faa/bard-google?query=${encodeURIComponent(query)}`
      const response = await axios.get(apiUrl)
      
      const resData = response.data
      if (resData && resData.status && resData.result) {
        await sock.sendMessage(
          senderJid,
          { text: `${resData.result}` },
          { quoted: msg }
        )
      } else {
        await sock.sendMessage(
          senderJid,
          { text: '❌ Gagal mendapatkan respons dari server AI.' },
          { quoted: msg }
        )
      }

    } catch (err) {
      console.error('❌ [BARD AI ERROR]:', err.message)
      await sock.sendMessage(
        senderJid,
        { text: '❌ Terjadi kesalahan saat menghubungi API AI.' },
        { quoted: msg }
      )
    }
  }
}

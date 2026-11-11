module.exports = {
  name: 'Hidetag',
  command: ['.tagall'],
  ownerOnly: true, // Hanya bisa dipakai oleh nomor bot sendiri (owner)
  description: 'Mention seluruh member grup secara tersembunyi',

  async execute({ sock, msg, args, senderJid }) {
    // Pastikan command dijalankan di dalam grup
    if (!senderJid.endsWith('@g.us')) {
      return sock.sendMessage(
        senderJid,
        { text: '❌ Perintah ini hanya dapat digunakan di dalam grup!' },
        { quoted: msg }
      )
    }

    try {
      // Ambil daftar semua member di grup
      const metadata = await sock.groupMetadata(senderJid)
      const participants = metadata.participants || []
      const memberJids = participants.map((p) => p.id)

      const textMessage = args.join(' ') || 'Halo semua!'

      // Kirim pesan hidetag dengan menyertakan seluruh JID member di mentions
      await sock.sendMessage(
        senderJid,
        {
          text: textMessage,
          mentions: memberJids,
        },
        { quoted: msg }
      )
    } catch (err) {
      console.error('Error di plugin hidetag:', err)
      await sock.sendMessage(
        senderJid,
        { text: '❌ Gagal mengirim hidetag: ' + err.message },
        { quoted: msg }
      )
    }
  },
}
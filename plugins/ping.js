module.exports = {
  name: 'ping',
  command: ['.ping'],
  ownerOnly: true,
  description: 'Cek latency',

  async execute({ sock, msg, senderJid }) {
    const t = Date.now()
    await sock.sendMessage(
      senderJid,
      { text: `🏓 ${Date.now() - t}ms` },
      { quoted: msg }
    )
  },
}

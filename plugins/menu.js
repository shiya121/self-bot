module.exports = {
  name: 'menu',
  command: ['.menu'],
  ownerOnly: true,
  description: 'Daftar fitur bot',

  async execute({ sock, msg, senderJid, plugins }) {
    if (!plugins || plugins.size === 0) {
      return sock.sendMessage(senderJid, { text: '❌ Belum ada plugin.' }, { quoted: msg })
    }

    // Dedupe: 1 plugin bisa punya banyak command → tampil sekali
    const seen = new Set()
    const lines = []

    for (const [, p] of plugins.entries()) {
      const key = p.name || p.command
      if (seen.has(key)) continue
      seen.add(key)

      const cmds = Array.isArray(p.command) ? p.command : [p.command]
      const cmdStr = cmds.join(' / ')
      const desc = p.description || '-'
      lines.push(`• ${cmdStr} — ${desc}`)
    }

    lines.sort() // urut alfabetis

    const text =
      `📋 *MENU BOT*\n\n` +
      lines.join('\n') +
      `\n\n_Total: ${lines.length} fitur_`

    await sock.sendMessage(senderJid, { text }, { quoted: msg })
  },
}

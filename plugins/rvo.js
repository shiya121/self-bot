const { writeFileSync, unlinkSync, readFileSync } = require('fs')
const { exec } = require('child_process')
const { tmpdir } = require('os')
const path = require('path')

module.exports = {
  name: 'rvo',
  command: ['.rvo'],
  ownerOnly: true,
  description: 'Reveal view-once media',

  async execute({ sock, msg, senderJid, helpers }) {
    const { downloadMediaWithRetry, filename } = helpers

    const contextInfo = msg.message.extendedTextMessage?.contextInfo
    const quotedMsg = contextInfo?.quotedMessage

    if (!quotedMsg) {
      console.log('❌ Tidak ada pesan yang di-reply.')
      return sock.sendMessage(
        senderJid,
        { text: '❌ Reply viewonce message to use this command.' },
        { quoted: msg }
      )
    }

    // Unwrap pesan view-once
    let mediaMsg = quotedMsg
    if (quotedMsg.viewOnceMessageV2) mediaMsg = quotedMsg.viewOnceMessageV2.message
    else if (quotedMsg.viewOnceMessage) mediaMsg = quotedMsg.viewOnceMessage.message
    else if (quotedMsg.viewOnceMessageV2Extension)
      mediaMsg = quotedMsg.viewOnceMessageV2Extension.message

    const type = Object.keys(mediaMsg)[0]
    console.log(`🔍 Tipe Media Terdeteksi: ${type}`)

    try {
      const targetMsg = {
        key: { remoteJid: senderJid, id: contextInfo.stanzaId, fromMe: false },
        message: mediaMsg,
      }

      const buffer = await downloadMediaWithRetry(sock, targetMsg)

      if (/(imageMessage|videoMessage)/.test(type)) {
        await sock.sendMessage(
          senderJid,
          {
            [type === 'imageMessage' ? 'image' : 'video']: buffer,
            caption: mediaMsg[type]?.caption || '',
          },
          { quoted: msg }
        )
      } else if (/audioMessage/.test(type)) {
        const mediaPath = path.join(tmpdir(), filename('mp3'))
        const resultPath = filename('mp3')
        writeFileSync(mediaPath, buffer)

        exec(
          `ffmpeg -i ${mediaPath} -vn -ar 44100 -ac 2 -b:a 128k ${resultPath}`,
          async (err) => {
            unlinkSync(mediaPath)
            if (err) {
              console.error('❌ FFMPEG Error:', err)
              return sock.sendMessage(
                senderJid,
                { text: '❌ Conversion failed.' },
                { quoted: msg }
              )
            }
            const buff = readFileSync(resultPath)
            await sock.sendMessage(
              senderJid,
              { audio: buff, mimetype: 'audio/mp4' },
              { quoted: msg }
            )
            unlinkSync(resultPath)
          }
        )
      } else {
        await sock.sendMessage(
          senderJid,
          { text: 'Format tidak didukung.' },
          { quoted: msg }
        )
      }
    } catch (err) {
      console.error('❌ [ERROR DOWNLOAD]:', err.message)
      await sock.sendMessage(
        senderJid,
        { text: '❌ Gagal memproses media. (Server WA Timeout)' },
        { quoted: msg }
      )
    }
  },
}

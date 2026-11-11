const makeWASocket = require('@whiskeysockets/baileys').default
const {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const readline = require('readline')
const { readdirSync, existsSync, mkdirSync, unlinkSync, statSync, watch } = require('fs')
const path = require('path')

// ================== KONFIGURASI ==================
const OWNER_NUMBER = '6289515113218' // Ganti dengan nomor bot kamu (awali 62)
// =================================================

// ✅ BARU: KONFIGURASI AUTO STATUS (Bisa diubah manual di sini atau via chat)
let AUTO_READ_SW = true       // true = nyala, false = mati (Bawaan: Nyala)
let AUTO_LIKE_SW = false       // true = nyala, false = mati (Bawaan: Nyala)
let AUTO_LIKE_EMOJI = '👋'    // Emoji untuk like status (Bawaan: 👋)
// =================================================

const OWNER_NUMBER_STR = OWNER_NUMBER
const OWNER_JID = OWNER_NUMBER_STR + '@s.whatsapp.net'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const question = (text) => new Promise((resolve) => rl.question(text, resolve))

// Helper nama file random
const filename = (ext) => `${Math.random().toString(36).substring(2, 15)}.${ext}`

// ================= FUNGSI AUTO-RETRY DOWNLOAD =================
async function downloadMediaWithRetry(sock, targetMsg, maxRetries = 3) {
  for (let i = 1; i <= maxRetries; i++) {
    try {
      console.log(`⏳ [DOWNLOAD] Mencoba mengunduh (Percobaan ke-${i})...`)
      const buffer = await downloadMediaMessage(
        targetMsg,
        'buffer',
        {},
        {
          logger: pino({ level: 'silent' }),
          reuploadRequest: sock.updateMediaMessage,
        }
      )
      if (buffer) {
        console.log(`✅ [DOWNLOAD] Berhasil pada percobaan ke-${i}.`)
        return buffer
      }
    } catch (err) {
      console.log(`⚠️ [DOWNLOAD GAGAL] Percobaan ke-${i}: ${err.message}`)
      if (i === maxRetries) {
        throw new Error('Gagal mengunduh media setelah beberapa kali percobaan.')
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }
}

// ================= SESSION CLEANER =================
function cleanStaleSessions() {
  const authDir = path.join(__dirname, 'auth_info')
  if (!existsSync(authDir)) return

  try {
    const files = readdirSync(authDir)
    let removedCount = 0
    for (const file of files) {
      if (file === 'creds.json') continue
      const filePath = path.join(authDir, file)
      const stats = statSync(filePath)
      
      if (file.startsWith('session-') || file.startsWith('sender-key-') || stats.size === 0) {
        unlinkSync(filePath)
        removedCount++
      }
    }
    if (removedCount > 0) {
      console.log(`🧹 [SESSION CLEANER] Membersihkan ${removedCount} sesi usang tanpa logout.`)
    }
  } catch (err) {
    console.error('⚠️ [SESSION CLEANER ERROR]:', err.message)
  }
}

// ================= PLUGIN LOADER & HOT RELOAD =================
const plugins = new Map()

function loadPlugins() {
  const pluginDir = path.join(__dirname, 'plugins')
  if (!existsSync(pluginDir)) mkdirSync(pluginDir)

  for (const file of readdirSync(pluginDir)) {
    const fullPath = path.join(pluginDir, file)
    if (require.cache[fullPath]) {
      delete require.cache[fullPath]
    }
  }

  plugins.clear()
  const files = readdirSync(pluginDir).filter((f) => f.endsWith('.js'))
  if (!files.length) {
    console.log('⚠️ Tidak ada plugin ditemukan di folder /plugins')
    return
  }

  for (const file of files) {
    try {
      const plugin = require(path.join(pluginDir, file))
      if (!plugin.command || typeof plugin.execute !== 'function') {
        console.error(`❌ Plugin ${file} tidak valid (butuh 'command' & 'execute')`)
        continue
      }
      const cmds = Array.isArray(plugin.command) ? plugin.command : [plugin.command]
      for (const cmd of cmds) {
        plugins.set(cmd.toLowerCase(), plugin)
      }
      console.log(`✅ Plugin loaded: ${plugin.name || file} → [${cmds.join(', ')}]`)
    } catch (err) {
      console.error(`❌ Gagal load plugin ${file}:`, err.message)
    }
  }
  console.log(`📦 Total plugin aktif: ${plugins.size} command\n`)
}

function watchPlugins() {
  const pluginDir = path.join(__dirname, 'plugins')
  if (!existsSync(pluginDir)) return

  watch(pluginDir, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
      console.log(`🔄 [HOT RELOAD] Perubahan terdeteksi pada ${filename}. Memuat ulang plugin...`)
      loadPlugins()
    }
  })
}

// ================= START BOT =================
async function startBot() {
  cleanStaleSessions()
  loadPlugins()
  watchPlugins()

  const messageCache = new Map()
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.0'],
    connectTimeoutMs: 60000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    getMessage: async (key) => {
      if (messageCache.has(key.id)) {
        return messageCache.get(key.id)
      }
      return { conversation: 'Pesan asli tidak ditemukan (Timeout/Expired)' }
    },
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr && !sock.authState.creds.registered) {
      const phoneNumber = await question('Masukkan nomor WhatsApp bot (contoh: 628xxx):\n')
      const code = await sock.requestPairingCode(phoneNumber.trim())
      console.log('\n✅ Pairing Code Anda: ' + code)
      console.log('Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon\n')
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut
      console.log('Koneksi terputus. Alasan:', lastDisconnect?.error?.message)
      if (shouldReconnect) startBot()
    } else if (connection === 'open') {
      console.log('✅ Bot berhasil terhubung ke WhatsApp!')
      console.log('🔐 Fitur siap digunakan dengan sistem Hot Reload & Session Cleaner.')
    }
  })

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0]
    if (!msg.message) return

    if (msg.key && msg.key.id) {
      messageCache.set(msg.key.id, msg.message)
      if (messageCache.size > 300) {
        const firstKey = messageCache.keys().next().value
        messageCache.delete(firstKey)
      }
    }

    const senderJid = msg.key.remoteJid

    // ===== AUTO READ & AUTO LIKE STATUS (SW) =====
    if (senderJid === 'status@broadcast') {
      try {
        // ✅ BARU: Cek apakah Auto Read nyala
        if (AUTO_READ_SW) {
          await sock.readMessages([msg.key])
        }
        
        // ✅ BARU: Cek apakah Auto Like nyala
        if (AUTO_LIKE_SW) {
          const participant = msg.key.participant
          if (participant) {
            await sock.sendMessage(
              'status@broadcast',
              { react: { text: AUTO_LIKE_EMOJI, key: msg.key } },
              { statusJidList: [participant] }
            )
            console.log(`❤️ [AUTO LIKE SW] Menyukai status dari: ${participant}`)
          }
        }
      } catch (err) {
        console.error('❌ [AUTO READ/LIKE SW ERROR]:', err.message)
      }
      return
    }

    const isOwner = msg.key.fromMe || senderJid === OWNER_JID
    const textMsg =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ''

    if (!textMsg.trim().startsWith('.')) return

    const [rawCmd, ...args] = textMsg.trim().split(/\s+/)
    const cmd = rawCmd.toLowerCase()

    // ✅ BARU: CORE COMMAND UNTUK AUTO STATUS (Ditaruh sebelum plugin)
    if (cmd === '.readsw') {
      if (!isOwner) return
      if (args[0] === 'on') AUTO_READ_SW = true
      else if (args[0] === 'off') AUTO_READ_SW = false
      else AUTO_READ_SW = !AUTO_READ_SW // Toggle
      
      await sock.sendMessage(senderJid, { 
        text: `👁️ *Auto Read SW:* ${AUTO_READ_SW ? '✅ ON' : '❌ OFF'}` 
      }, { quoted: msg })
      return
    }

    if (cmd === '.likesw') {
      if (!isOwner) return
      if (args[0] === 'on') AUTO_LIKE_SW = true
      else if (args[0] === 'off') AUTO_LIKE_SW = false
      else AUTO_LIKE_SW = !AUTO_LIKE_SW // Toggle
      
      await sock.sendMessage(senderJid, { 
        text: `❤️ *Auto Like SW:* ${AUTO_LIKE_SW ? '✅ ON' : '❌ OFF'}\n_Emoji: ${AUTO_LIKE_EMOJI}_` 
      }, { quoted: msg })
      return
    }

    // ✅ BARU: Command untuk ganti emoji via chat
    if (cmd === '.setemoji') {
      if (!isOwner) return
      if (!args[0]) {
        return await sock.sendMessage(senderJid, { text: '❌ Masukkan emoji. Contoh: .setemoji 🔥' }, { quoted: msg })
      }
      AUTO_LIKE_EMOJI = args[0]
      await sock.sendMessage(senderJid, { text: `✅ Emoji like diubah menjadi: ${AUTO_LIKE_EMOJI}` }, { quoted: msg })
      return
    }
    // =================================================

    // Lanjut ke plugin
    const plugin = plugins.get(cmd)
    if (!plugin) return

    const ownerOnly = plugin.ownerOnly !== false
    if (ownerOnly && !isOwner) {
      console.log(`⛔ ${senderJid} mencoba ${cmd} (owner-only). Ditolak.`)
      return
    }

    const ctx = {
      sock,
      msg,
      args,
      senderJid,
      isOwner,
      textMsg,
      command: cmd,
      plugins,
      helpers: { downloadMediaWithRetry, filename, OWNER_JID, OWNER_NUMBER },
    }

    try {
      console.log(`▶️ Menjalankan plugin "${plugin.name || cmd}" (cmd: ${cmd})`)
      await plugin.execute(ctx)
    } catch (err) {
      console.error(`❌ Error di plugin ${cmd}:`, err)
      await sock.sendMessage(
        senderJid,
        { text: '❌ Terjadi kesalahan: ' + err.message },
        { quoted: msg }
      )
    }
  })
}

startBot().catch((err) => console.error('Error:', err))
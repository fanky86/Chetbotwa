const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const Pino = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

// ================= CONFIG =================
const ADMIN = '628xxxxxxxxxx@s.whatsapp.net' // GANTI NOMOR KAMU
const COOLDOWN = 60 * 1000 // 1 menit
const EXPIRE = 24 * 60 * 60 * 1000 // 24 jam
const DB_FILE = './confess.json'

// ================= DATABASE =================
let confessDB = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(confessDB, null, 2))
}

// ================= STATE =================
const users = {}
const cooldown = {}

function genCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase()
}

function fixNumber(num) {
  let n = num.replace(/[^0-9]/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  return n
}

function onCooldown(id) {
  if (!cooldown[id]) return false
  return Date.now() - cooldown[id] < COOLDOWN
}

// ================= BOT =================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')
  const sock = makeWASocket({
    logger: Pino({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (u) => {
    if (u.qr) qrcode.generate(u.qr, { small: true })
    if (u.connection === 'open') console.log('✅ Bot Confess Online')
    if (
      u.connection === 'close' &&
      u.lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
    ) startBot()
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text
    if (!text) return

    const lower = text.toLowerCase()

    // ===== MENU =====
    if (['menu', 'help'].includes(lower)) {
      return sock.sendMessage(from, {
        text:
`📋 *MENU CONFESS*
• ketik: confess → kirim confess
• ketik: balas → balas confess
• anonim & aman`
      })
    }

    // ===== COOLDOWN =====
    if (onCooldown(from)) {
      return sock.sendMessage(from, {
        text: '⏳ Tunggu sebentar sebelum lanjut.'
      })
    }

    // ===== CONFESS =====
    if (lower === 'confess') {
      users[from] = { step: 'number' }
      cooldown[from] = Date.now()
      return sock.sendMessage(from, { text: '📩 Kirim nomor tujuan' })
    }

    // ===== BALAS =====
    if (lower === 'balas') {
      users[from] = { step: 'reply_code' }
      cooldown[from] = Date.now()
      return sock.sendMessage(from, { text: '🔑 Masukkan kode confess' })
    }

    const user = users[from]
    if (!user) return

    // ===== STEP CONFESS =====
    if (user.step === 'number') {
      user.number = fixNumber(text)
      user.step = 'message'
      return sock.sendMessage(from, { text: '💬 Tulis pesan confess kamu' })
    }

    if (user.step === 'message') {
      const code = genCode()
      const target = user.number + '@s.whatsapp.net'

      confessDB[code] = {
        sender: from,
        created: Date.now()
      }
      saveDB()

      try {
        await sock.sendMessage(target, {
          text:
`💌 *CONFESSION ANONIM*
Kode: *${code}*

${text}

Balas dengan ketik:
balas`
        })

        await sock.sendMessage(from, {
          text: `✅ Confess terkirim!\nKode: ${code}`
        })

        // ADMIN LOG
        await sock.sendMessage(ADMIN, {
          text: `📥 CONFESS\nKode: ${code}\nKe: ${user.number}`
        })
      } catch {
        await sock.sendMessage(from, { text: '❌ Gagal mengirim confess.' })
      }

      delete users[from]
    }

    // ===== STEP BALAS =====
    if (user.step === 'reply_code') {
      const code = text.toUpperCase()
      const data = confessDB[code]

      if (!data || Date.now() - data.created > EXPIRE) {
        delete confessDB[code]
        saveDB()
        delete users[from]
        return sock.sendMessage(from, {
          text: '❌ Kode tidak valid / kadaluarsa'
        })
      }

      user.code = code
      user.step = 'reply_message'
      return sock.sendMessage(from, { text: '💬 Tulis balasan kamu' })
    }

    if (user.step === 'reply_message') {
      const data = confessDB[user.code]

      await sock.sendMessage(data.sender, {
        text:
`💬 *BALASAN CONFESS*
Kode: ${user.code}

${text}`
      })

      await sock.sendMessage(from, {
        text: '✅ Balasan terkirim secara anonim!'
      })

      delete confessDB[user.code]
      saveDB()
      delete users[from]
    }
  })
}

startBot()

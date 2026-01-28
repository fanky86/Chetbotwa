const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const Pino = require('pino')
const qrcode = require('qrcode-terminal')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    logger: Pino({ level: 'silent' }),
    auth: state
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    // 🔥 TAMPILKAN QR
    if (qr) {
      console.log('📲 Scan QR ini:')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode
      if (reason !== DisconnectReason.loggedOut) {
        startBot()
      } else {
        console.log('❌ Logged out.')
      }
    }

    if (connection === 'open') {
      console.log('✅ Bot Confess Online!')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    if (text.startsWith('confess|')) {
      const [, number, message] = text.split('|')
      if (!number || !message) {
        return sock.sendMessage(from, {
          text: '❌ Format salah!\nContoh:\nconfess|628xxxxxx|isi pesan'
        })
      }

      const target = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net'

      await sock.sendMessage(target, {
        text: `💌 *CONFESSION ANONIM*\n\n${message}\n\n_#anon_`
      })

      await sock.sendMessage(from, {
        text: '✅ Confess berhasil dikirim!'
      })
    }
  })
}

startBot()

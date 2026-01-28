const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys')
const Pino = require('pino')

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session')

  const sock = makeWASocket({
    logger: Pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
        startBot()
      }
    } else if (connection === 'open') {
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

    /**
     * FORMAT:
     * confess|628xxxxxx|isi pesan
     * confessgc|linkgrup|isi pesan
     */

    if (text.startsWith('confess|')) {
      const [, number, message] = text.split('|')
      if (!number || !message) {
        return sock.sendMessage(from, {
          text: '❌ Format salah!\nContoh:\nconfess|6281234567890|Aku suka kamu'
        })
      }

      const target = number.replace(/[^0-9]/g, '') + '@s.whatsapp.net'

      await sock.sendMessage(target, {
        text: `💌 *CONFESSION ANONIM*\n\n${message}\n\n_#anon_`
      })

      await sock.sendMessage(from, {
        text: '✅ Confess berhasil dikirim secara anonim!'
      })
    }

    if (text.startsWith('confessgc|')) {
      const [, groupJid, message] = text.split('|')
      if (!groupJid || !message) {
        return sock.sendMessage(from, {
          text: '❌ Format salah!\nContoh:\nconfessgc|120xxxx@g.us|Halo semua'
        })
      }

      await sock.sendMessage(groupJid, {
        text: `💌 *CONFESSION ANONIM*\n\n${message}\n\n_#anon_`
      })

      await sock.sendMessage(from, {
        text: '✅ Confess ke grup berhasil!'
      })
    }
  })
}

startBot()

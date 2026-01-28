const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
require('dotenv').config();

// Inisialisasi Express untuk Vercel
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variabel untuk menyimpan data
let confessions = [];
let confessionQueue = [];
let adminList = process.env.ADMIN_NUMBERS ? process.env.ADMIN_NUMBERS.split(',') : [];
const confessionChannel = process.env.CONFESSION_CHANNEL || '';

// Konfigurasi Puppeteer untuk Termux dan Vercel
const getPuppeteerConfig = () => {
  const config = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-features=site-per-process'
    ]
  };

  // Untuk Termux (Android), gunakan Chrome yang sudah terinstal
  if (process.platform === 'android' || process.env.TERMUX_VERSION) {
    config.executablePath = 'chromium';
    console.log('🔧 Menggunakan Chromium untuk Termux');
  }
  
  // Untuk Vercel, gunakan Chromium dari @sparticuz/chromium
  if (process.env.VERCEL) {
    console.log('🔧 Menggunakan Chromium untuk Vercel');
    // @sparticuz/chromium akan dihandle secara otomatis
  }

  return config;
};

// Inisialisasi WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "confession-bot"
  }),
  puppeteer: getPuppeteerConfig(),
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
  }
});

// Event ketika QR code diperlukan
client.on('qr', (qr) => {
  console.log('QR Code received, scan with your phone!');
  qrcode.generate(qr, { small: true });
  
  // Tampilkan QR di console untuk Vercel
  console.log(`\n\nScan QR Code di atas untuk menghubungkan bot\n`);
});

// Event ketika client siap
client.on('ready', () => {
  console.log('✅ Bot WhatsApp siap digunakan!');
  console.log(`🤖 Bot berjalan sebagai: ${client.info.pushname}`);
  console.log(`📱 Nomor bot: ${client.info.wid.user}`);
  console.log(`👥 Jumlah admin: ${adminList.length}`);
  console.log(`📢 Channel confession: ${confessionChannel || 'Belum diatur'}`);
});

// Event ketika terjadi error
client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

// Event ketika disconnected
client.on('disconnected', (reason) => {
  console.log('⚠️ Client disconnected:', reason);
  console.log('🔄 Mencoba menghubungkan ulang...');
  client.initialize();
});

// Fungsi untuk mendapatkan nomor WhatsApp yang diformat
function formatNumber(number) {
  if (!number) return '';
  
  // Hapus semua karakter non-digit
  let cleaned = number.toString().replace(/\D/g, '');
  
  // Jika nomor diawali dengan 0, ganti dengan kode negara
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }
  
  // Jika nomor tidak memiliki kode negara, tambahkan 62
  if (!cleaned.startsWith('62')) {
    cleaned = '62' + cleaned;
  }
  
  return cleaned + '@c.us';
}

// Fungsi untuk mengirim pesan ke admin
async function notifyAdmins(message) {
  for (const admin of adminList) {
    try {
      const formattedAdmin = formatNumber(admin.trim());
      if (formattedAdmin) {
        await client.sendMessage(formattedAdmin, message);
      }
    } catch (error) {
      console.error(`Gagal mengirim ke admin ${admin}:`, error.message);
    }
  }
}

// Event ketika menerima pesan
client.on('message', async (message) => {
  const sender = message.from;
  const body = message.body?.toLowerCase()?.trim() || '';
  const isGroup = message.from.endsWith('@g.us');
  const isAdmin = adminList.some(admin => {
    const formattedAdmin = formatNumber(admin.trim());
    return formattedAdmin && sender.includes(formattedAdmin.replace('@c.us', ''));
  });
  
  console.log(`📩 Pesan dari: ${sender} - ${body.substring(0, 50)}${body.length > 50 ? '...' : ''}`);
  
  // Skip pesan dari broadcast atau status
  if (message.isStatus || message.from.includes('status')) {
    return;
  }
  
  // Command untuk semua pengguna
  if (body === '!menu' || body === '.menu' || body === '/menu') {
    const menu = `🤖 *CONFESSION BOT* 🤖\n\n` +
      `*Perintah Umum:*\n` +
      `• !confess <pesan> - Kirim confession\n` +
      `• !help - Tampilkan bantuan\n` +
      `• !status - Cek status bot\n\n` +
      `*Perintah Admin:*\n` +
      `• !approve <id> - Setujui confession\n` +
      `• !reject <id> - Tolak confession\n` +
      `• !list - Lihat daftar confession\n` +
      `• !broadcast <pesan> - Broadcast ke channel\n` +
      `• !setchannel <nomor> - Set channel confession\n` +
      `• !addadmin <nomor> - Tambah admin\n` +
      `• !stats - Lihat statistik`;
    
    await message.reply(menu);
    return;
  }
  
  if (body === '!help' || body === '.help' || body === '/help') {
    const help = `📖 *BANTUAN CONFESSION BOT* 📖\n\n` +
      `Cara menggunakan:\n` +
      `1. Ketik !confess lalu spasi dan tulis confession kamu\n` +
      `   Contoh: !confess Aku suka sama dia\n\n` +
      `2. Confession kamu akan masuk ke antrian\n` +
      `3. Admin akan meninjau dan menyetujui\n` +
      `4. Jika disetujui, confession akan diposting di channel\n\n` +
      `Confession bersifat ANONIM! Admin tidak tahu siapa pengirimnya.\n\n` +
      `Gunakan !menu untuk melihat semua perintah.`;
    
    await message.reply(help);
    return;
  }
  
  if (body === '!status' || body === '.status') {
    const status = `📊 *STATUS BOT* 📊\n\n` +
      `• Bot: ✅ Online\n` +
      `• Confession dalam antrian: ${confessionQueue.length}\n` +
      `• Total confession: ${confessions.length}\n` +
      `• Admin aktif: ${adminList.length}\n` +
      `• Channel confession: ${confessionChannel ? '✅' : '❌'}\n\n` +
      `Bot by Confession Team`;
    
    await message.reply(status);
    return;
  }
  
  // Command !confess
  if (body.startsWith('!confess') || body.startsWith('.confess') || body.startsWith('/confess')) {
    const confessionText = message.body.substring(message.body.indexOf(' ') + 1).trim();
    
    if (!confessionText) {
      await message.reply('❌ Format salah! Gunakan: !confess <pesan>\nContoh: !confess Aku rindu dia');
      return;
    }
    
    if (confessionText.length < 5) {
      await message.reply('❌ Confession terlalu pendek! Minimal 5 karakter.');
      return;
    }
    
    if (confessionText.length > 1000) {
      await message.reply('❌ Confession terlalu panjang! Maksimal 1000 karakter.');
      return;
    }
    
    // Generate ID unik
    const confessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    
    // Tambah ke antrian
    confessionQueue.push({
      id: confessionId,
      text: confessionText,
      sender: sender,
      timestamp: new Date(),
      status: 'pending'
    });
    
    // Kirim konfirmasi ke pengirim
    await message.reply(`✅ Confession berhasil dikirim! ID: *${confessionId}*\n\nConfession kamu akan ditinjau admin.`);
    
    // Notifikasi ke admin
    const shortText = confessionText.length > 100 ? confessionText.substring(0, 100) + '...' : confessionText;
    await notifyAdmins(`📥 *CONFESSION BARU*\nID: ${confessionId}\nPesan: ${shortText}\n\nBalas dengan:\n!approve ${confessionId}\natau\n!reject ${confessionId}`);
    
    console.log(`Confession baru: ${confessionId} dari ${sender}`);
    return;
  }
  
  // COMMAND ADMIN ONLY
  if (!isAdmin) return;
  
  // Command !approve
  if (body.startsWith('!approve') || body.startsWith('.approve')) {
    const confessionId = body.split(' ')[1];
    
    if (!confessionId) {
      await message.reply('❌ Format: !approve <id_confession>');
      return;
    }
    
    const confessionIndex = confessionQueue.findIndex(c => c.id === confessionId);
    
    if (confessionIndex === -1) {
      await message.reply('❌ Confession tidak ditemukan!');
      return;
    }
    
    const confession = confessionQueue[confessionIndex];
    
    // Post ke channel confession
    if (confessionChannel) {
      try {
        const formattedChannel = formatNumber(confessionChannel);
        if (!formattedChannel) {
          await message.reply('❌ Format channel tidak valid!');
          return;
        }
        
        const confessionMessage = `💌 *CONFESSION* 💌\n\n${confession.text}\n\n_#ConfessionBot_`;
        
        await client.sendMessage(formattedChannel, confessionMessage);
        confession.status = 'approved';
        confession.approvedBy = sender;
        confession.approvedAt = new Date();
        
        // Pindahkan dari antrian ke daftar confession
        confessions.push(confession);
        confessionQueue.splice(confessionIndex, 1);
        
        await message.reply(`✅ Confession *${confessionId}* telah disetujui dan diposting!`);
        
        // Beri tahu pengirim
        try {
          await client.sendMessage(confession.sender, `🎉 Confession kamu (ID: *${confessionId}*) telah disetujui dan diposting!`);
        } catch (error) {
          console.log('Tidak bisa memberi tahu pengirim:', error.message);
        }
        
      } catch (error) {
        await message.reply(`❌ Gagal memposting confession: ${error.message}`);
      }
    } else {
      await message.reply('❌ Channel confession belum diatur! Gunakan !setchannel <nomor>');
    }
    return;
  }
  
  // Command !reject
  if (body.startsWith('!reject') || body.startsWith('.reject')) {
    const confessionId = body.split(' ')[1];
    
    if (!confessionId) {
      await message.reply('❌ Format: !reject <id_confession>');
      return;
    }
    
    const confessionIndex = confessionQueue.findIndex(c => c.id === confessionId);
    
    if (confessionIndex === -1) {
      await message.reply('❌ Confession tidak ditemukan!');
      return;
    }
    
    const confession = confessionQueue[confessionIndex];
    confessionQueue.splice(confessionIndex, 1);
    
    await message.reply(`❌ Confession *${confessionId}* telah ditolak.`);
    
    // Beri tahu pengirim
    try {
      await client.sendMessage(confession.sender, `😔 Maaf, confession kamu (ID: *${confessionId}*) tidak disetujui.`);
    } catch (error) {
      console.log('Tidak bisa memberi tahu pengirim:', error.message);
    }
    
    return;
  }
  
  // Command !list
  if (body === '!list' || body === '.list') {
    if (confessionQueue.length === 0) {
      await message.reply('📭 Tidak ada confession dalam antrian.');
      return;
    }
    
    let listMessage = `📋 *DAFTAR CONFESSION* (${confessionQueue.length})\n\n`;
    
    confessionQueue.forEach((confession, index) => {
      listMessage += `*${index + 1}. ID:* ${confession.id}\n`;
      listMessage += `   Pesan: ${confession.text.substring(0, 50)}${confession.text.length > 50 ? '...' : ''}\n`;
      listMessage += `   Waktu: ${confession.timestamp.toLocaleTimeString('id-ID')}\n\n`;
    });
    
    listMessage += `\nGunakan !approve <id> atau !reject <id>`;
    
    await message.reply(listMessage);
    return;
  }
  
  // Command !broadcast
  if (body.startsWith('!broadcast') || body.startsWith('.broadcast')) {
    if (!confessionChannel) {
      await message.reply('❌ Channel belum diatur!');
      return;
    }
    
    const broadcastMessage = message.body.substring(message.body.indexOf(' ') + 1).trim();
    
    if (!broadcastMessage) {
      await message.reply('❌ Format: !broadcast <pesan>');
      return;
    }
    
    try {
      const formattedChannel = formatNumber(confessionChannel);
      if (!formattedChannel) {
        await message.reply('❌ Format channel tidak valid!');
        return;
      }
      
      await client.sendMessage(formattedChannel, `📢 *PENGUMUMAN*\n\n${broadcastMessage}\n\n_Admin Confession_`);
      await message.reply('✅ Broadcast berhasil dikirim!');
    } catch (error) {
      await message.reply(`❌ Gagal broadcast: ${error.message}`);
    }
    return;
  }
  
  // Command !setchannel
  if (body.startsWith('!setchannel') || body.startsWith('.setchannel')) {
    const channelNumber = body.split(' ')[1];
    
    if (!channelNumber) {
      await message.reply('❌ Format: !setchannel <nomor>\nContoh: !setchannel 6281234567890');
      return;
    }
    
    // Update channel di environment variable
    process.env.CONFESSION_CHANNEL = channelNumber;
    
    await message.reply(`✅ Channel confession berhasil diatur ke: ${channelNumber}\n\nPastikan bot sudah ditambahkan ke grup/nomor tersebut.`);
    return;
  }
  
  // Command !addadmin
  if (body.startsWith('!addadmin') || body.startsWith('.addadmin')) {
    const newAdmin = body.split(' ')[1];
    
    if (!newAdmin) {
      await message.reply('❌ Format: !addadmin <nomor>\nContoh: !addadmin 6281234567890');
      return;
    }
    
    if (adminList.includes(newAdmin)) {
      await message.reply('❌ Nomor ini sudah menjadi admin.');
      return;
    }
    
    adminList.push(newAdmin);
    await message.reply(`✅ Admin berhasil ditambahkan: ${newAdmin}\n\nAdmin saat ini: ${adminList.join(', ')}`);
    return;
  }
  
  // Command !stats
  if (body === '!stats' || body === '.stats') {
    const today = new Date();
    const todayConfessions = confessions.filter(c => 
      c.approvedAt && 
      c.approvedAt.getDate() === today.getDate() &&
      c.approvedAt.getMonth() === today.getMonth() &&
      c.approvedAt.getFullYear() === today.getFullYear()
    ).length;
    
    const stats = `📈 *STATISTIK CONFESSION* 📈\n\n` +
      `• Total confession disetujui: ${confessions.length}\n` +
      `• Confession hari ini: ${todayConfessions}\n` +
      `• Dalam antrian: ${confessionQueue.length}\n` +
      `• Jumlah admin: ${adminList.length}\n` +
      `• Bot aktif sejak: ${client.info ? new Date(client.info.connect.time * 1000).toLocaleString('id-ID') : 'N/A'}\n\n` +
      `_Data sejak bot dijalankan_`;
    
    await message.reply(stats);
    return;
  }
});

// Rute untuk health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'WhatsApp Confession Bot',
    version: '1.0.0',
    confessionQueue: confessionQueue.length,
    totalConfessions: confessions.length,
    adminCount: adminList.length,
    botReady: client.info ? true : false,
    uptime: process.uptime(),
    platform: process.platform,
    termux: !!process.env.TERMUX_VERSION
  });
});

// Rute untuk melihat antrian confession
app.get('/queue', (req, res) => {
  res.json({
    queue: confessionQueue,
    count: confessionQueue.length
  });
});

// Rute untuk melihat confession yang sudah diposting
app.get('/confessions', (req, res) => {
  res.json({
    confessions: confessions.slice(-20), // 20 terakhir
    count: confessions.length
  });
});

// Rute untuk mendapatkan status bot
app.get('/status', (req, res) => {
  res.json({
    botReady: !!client.info,
    user: client.info ? client.info.pushname : null,
    phone: client.info ? client.info.wid.user : null,
    platform: process.platform
  });
});

// Inisialisasi client WhatsApp
client.initialize().catch(err => {
  console.error('❌ Gagal menginisialisasi client:', err);
});

// Jalankan server Express
const server = app.listen(port, () => {
  console.log(`🚀 Server berjalan di port ${port}`);
  console.log(`🌐 Health check: http://localhost:${port}`);
  console.log(`📱 Platform: ${process.platform}`);
  console.log(`🔧 Termux: ${process.env.TERMUX_VERSION ? 'Yes' : 'No'}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏳ Menutup bot...');
  try {
    await client.destroy();
    server.close();
    console.log('✅ Bot berhasil dimatikan.');
  } catch (error) {
    console.error('Error saat menutup:', error);
  }
  process.exit(0);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Export app untuk Vercel
module.exports = app;

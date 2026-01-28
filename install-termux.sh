#!/data/data/com.termux/files/usr/bin/bash

echo "📱 Install WhatsApp Confession Bot di Termux"
echo "==========================================="

# Update package list
pkg update -y && pkg upgrade -y

# Install dependencies
echo "📦 Menginstal dependencies sistem..."
pkg install -y nodejs-lts git curl wget chromium

# Install Chromium untuk Termux
echo "🌐 Menginstal Chromium..."
pkg install -y chromium

# Clone repo atau gunakan direktori saat ini
echo "📁 Setup proyek..."
if [ ! -f "package.json" ]; then
    echo "⚠️  package.json tidak ditemukan, pastikan Anda di direktori yang benar"
    exit 1
fi

# Install Node.js dependencies dengan mengabaikan script puppeteer
echo "🔧 Menginstal dependencies Node.js..."
npm config set puppeteer_skip_chromium_download true
npm install --ignore-scripts

# Install puppeteer tanpa download chromium
echo "🤖 Menginstal Puppeteer..."
npm install puppeteer@latest --ignore-scripts

# Buat symlink untuk chromium
echo "🔗 Membuat symlink Chromium..."
if [ -f "/data/data/com.termux/files/usr/bin/chromium" ]; then
    echo "✅ Chromium sudah terinstal"
else
    ln -s /data/data/com.termux/files/usr/bin/chromium-browser /data/data/com.termux/files/usr/bin/chromium 2>/dev/null || true
fi

# Setup environment
echo "⚙️  Setup environment..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "📝 Edit file .env untuk konfigurasi:"
        echo "   ADMIN_NUMBERS=6281234567890"
        echo "   CONFESSION_CHANNEL=6281234567890"
    fi
fi

echo ""
echo "✅ Instalasi selesai!"
echo ""
echo "📋 Perintah yang tersedia:"
echo "   npm start          - Jalankan bot"
echo "   npm run dev        - Jalankan dengan auto-restart"
echo "   node index.js      - Jalankan bot"
echo ""
echo "🔧 Pastikan Chromium terinstal dengan benar:"
echo "   pkg install chromium -y"
echo ""
echo "📝 Jangan lupa edit file .env dengan nomor Anda!"

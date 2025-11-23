#!/bin/bash

# Скрипт для деплоя бота на VPS
# Использование: bash deploy-to-vps.sh

VPS_HOST="92.118.170.155"
VPS_USER="root"
BOT_DIR="/opt/psihomир-bot"

echo "🚀 Начинаем деплой ПСИХОМИР бота на VPS..."

# Подключаемся к VPS и выполняем команды
ssh ${VPS_USER}@${VPS_HOST} << 'ENDSSH'

echo "📦 Шаг 1: Установка Node.js и npm (если не установлены)..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

echo "📦 Шаг 2: Установка PM2 (если не установлен)..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

echo "📁 Шаг 3: Создание директории для бота..."
mkdir -p /opt/psihomір-bot
cd /opt/psihomір-bot

echo "📥 Шаг 4: Клонирование репозитория..."
if [ -d ".git" ]; then
    echo "Репозиторий уже существует, обновляем..."
    git pull
else
    git clone https://github.com/canada07891-cloud/psihom--telegram-bot.git .
fi

echo "📦 Шаг 5: Установка зависимостей..."
npm install

echo "🔧 Шаг 6: Создание .env файла..."
cat > .env << 'EOF'
BOT_TOKEN=7835027090:AAFlAQzoGxV44skk7RL-dRq5sxNhIafejJ0
ADMIN_CHAT_ID=7974263883
EOF

echo "🔄 Шаг 7: Перезапуск бота через PM2..."
pm2 delete psihomір-bot 2>/dev/null || true
pm2 start bot.js --name psihomір-bot
pm2 save
pm2 startup systemd -u root --hp /root

echo "✅ Деплой завершен!"
echo ""
echo "Полезные команды для управления ботом:"
echo "  pm2 status           - статус бота"
echo "  pm2 logs psihomір-bot - логи бота"
echo "  pm2 restart psihomір-bot - перезапуск"
echo "  pm2 stop psihomір-bot - остановка"

ENDSSH

echo ""
echo "✨ Бот успешно задеплоен на VPS!"
echo "🌐 IP: ${VPS_HOST}"

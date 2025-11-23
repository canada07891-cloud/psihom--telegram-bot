# Деплой на VPS (92.118.170.155)

## Вариант 1: Автоматический деплой (рекомендуется)

Запустите скрипт:

```bash
bash deploy-to-vps.sh
```

При запросе введите пароль: `0gvo8e8D0A`

---

## Вариант 2: Ручной деплой

### Шаг 1: Подключитесь к VPS

```bash
ssh root@92.118.170.155
```

Пароль: `0gvo8e8D0A`

### Шаг 2: Установите Node.js (если еще не установлен)

```bash
# Проверить установлен ли Node.js
node --version

# Если не установлен, установить:
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs
```

### Шаг 3: Установите PM2 для управления процессом

```bash
npm install -g pm2
```

### Шаг 4: Клонируйте репозиторий

```bash
cd /opt
git clone https://github.com/canada07891-cloud/psihom--telegram-bot.git psihomір-bot
cd psihomір-bot
```

### Шаг 5: Установите зависимости

```bash
npm install
```

### Шаг 6: Создайте .env файл

```bash
nano .env
```

Вставьте следующее содержимое:

```
BOT_TOKEN=7835027090:AAFlAQzoGxV44skk7RL-dRq5sxNhIafejJ0
ADMIN_CHAT_ID=7974263883
```

Сохраните: `Ctrl+O`, `Enter`, `Ctrl+X`

### Шаг 7: Запустите бота через PM2

```bash
pm2 start bot.js --name psihomір-bot
pm2 save
pm2 startup
```

Скопируйте и выполните команду, которую покажет `pm2 startup`

### Шаг 8: Проверьте статус

```bash
pm2 status
pm2 logs psihomір-bot
```

---

## Управление ботом

После установки вы можете управлять ботом через SSH:

```bash
# Посмотреть статус
pm2 status

# Посмотреть логи
pm2 logs psihomір-bot

# Перезапустить
pm2 restart psihomір-bot

# Остановить
pm2 stop psihomір-bot

# Запустить
pm2 start psihomір-bot

# Удалить из PM2
pm2 delete psihomір-bot
```

---

## Обновление бота

Когда нужно обновить код:

```bash
ssh root@92.118.170.155
cd /opt/psihomір-bot
git pull
npm install
pm2 restart psihomір-bot
```

Или используйте скрипт:

```bash
bash deploy-to-vps.sh
```

---

## Мониторинг

Установите PM2 мониторинг (опционально):

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## Безопасность

Рекомендации для VPS:

1. **Настройте firewall:**
```bash
ufw allow 22/tcp
ufw enable
```

2. **Создайте отдельного пользователя (не root):**
```bash
adduser botuser
usermod -aG sudo botuser
```

3. **Настройте SSH ключи вместо пароля:**
```bash
ssh-keygen -t rsa -b 4096
ssh-copy-id root@92.118.170.155
```

---

## Troubleshooting

### Бот не запускается

```bash
# Проверьте логи
pm2 logs psihomір-bot --lines 50

# Проверьте .env файл
cat .env

# Запустите бота вручную для отладки
node bot.js
```

### Бот останавливается

```bash
# PM2 автоматически перезапустит, но проверьте логи
pm2 logs psihomір-bot

# Увеличьте лимит перезапусков
pm2 start bot.js --max-restarts 10
```

---

## Готово!

Ваш бот теперь работает 24/7 на вашем VPS с автозапуском при перезагрузке сервера!

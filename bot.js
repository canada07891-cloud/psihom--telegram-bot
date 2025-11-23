require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Конфигурация
const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

// Создание бота
const bot = new TelegramBot(token, { polling: true });

// Пути к файлам данных
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REGISTRATIONS_FILE = path.join(DATA_DIR, 'registrations.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const BLOCKED_FILE = path.join(DATA_DIR, 'blocked.json');

// Создаем папку data если не существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== БАЗА ДАННЫХ ====================

function loadData(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`Ошибка загрузки ${filePath}:`, error.message);
  }
  return defaultValue;
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Ошибка сохранения ${filePath}:`, error.message);
  }
}

// Загрузка данных
let users = loadData(USERS_FILE, []);
let registrations = loadData(REGISTRATIONS_FILE, []);
let blockedUsers = loadData(BLOCKED_FILE, []);
let events = loadData(EVENTS_FILE, {
  day1: '22.11.2025 с 11:00 до 15:00',
  day2: '23.11.2025 с 11:00 до 15:00',
  address: 'ул. Студенческая, д. 35',
  description: 'Пространство психологических программ и оздоровительных практик',
  active: true
});

// Сессии пользователей
const userSessions = {};

// ==================== КОНСТАНТЫ ====================

const MIN_AGE = 18;
const MAX_AGE = 100;

const STATES = {
  IDLE: 'idle',
  WAITING_NAME: 'waiting_name',
  WAITING_AGE: 'waiting_age',
  WAITING_PHONE: 'waiting_phone',
  ADMIN_BROADCAST: 'admin_broadcast',
  ADMIN_BROADCAST_PHOTO: 'admin_broadcast_photo',
  ADMIN_EDIT_DAY1: 'admin_edit_day1',
  ADMIN_EDIT_DAY2: 'admin_edit_day2',
  ADMIN_EDIT_ADDRESS: 'admin_edit_address',
  ADMIN_EDIT_DESCRIPTION: 'admin_edit_description',
  ADMIN_SEND_TO_USER: 'admin_send_to_user',
  ADMIN_FIND_USER: 'admin_find_user'
};

// ==================== УТИЛИТЫ ====================

function isAdmin(chatId) {
  return chatId.toString() === adminChatId.toString();
}

function isBlocked(chatId) {
  return blockedUsers.includes(chatId);
}

function addUser(chatId, username, firstName, lastName) {
  const existing = users.find(u => u.chatId === chatId);
  if (!existing) {
    users.push({
      chatId,
      username: username || null,
      firstName: firstName || null,
      lastName: lastName || null,
      joinedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    });
    saveData(USERS_FILE, users);
  } else {
    existing.lastActivity = new Date().toISOString();
    if (username) existing.username = username;
    if (firstName) existing.firstName = firstName;
    saveData(USERS_FILE, users);
  }
}

function addRegistration(chatId, userData) {
  registrations.push({
    id: Date.now(),
    chatId,
    ...userData,
    registeredAt: new Date().toISOString()
  });
  saveData(REGISTRATIONS_FILE, registrations);
}

function validateAge(age) {
  const num = parseInt(age);
  if (isNaN(num)) return { valid: false, message: '❗ Пожалуйста, введите число.' };
  if (num < MIN_AGE || num > MAX_AGE) return { valid: false, message: `❗ Возраст должен быть от ${MIN_AGE} до ${MAX_AGE} лет.` };
  return { valid: true, value: num };
}

function validatePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return { valid: false, message: '❗ Введите корректный номер телефона.' };
  return { valid: true, value: phone.trim() };
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getStats() {
  const now = new Date();
  const today = now.toDateString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  return {
    totalUsers: users.length,
    totalRegistrations: registrations.length,
    todayRegistrations: registrations.filter(r => new Date(r.registeredAt).toDateString() === today).length,
    weekRegistrations: registrations.filter(r => new Date(r.registeredAt) >= weekAgo).length,
    activeUsers: users.filter(u => new Date(u.lastActivity) >= weekAgo).length,
    blockedUsers: blockedUsers.length
  };
}

// ==================== АДМИН-ПАНЕЛЬ ====================

async function showAdminMenu(chatId, messageId = null) {
  const stats = getStats();

  const text =
    '🔐 *АДМИН-ПАНЕЛЬ ПСИХОМИР*\n\n' +
    `👥 Пользователей: *${stats.totalUsers}*\n` +
    `📝 Записей: *${stats.totalRegistrations}*\n` +
    `📅 Сегодня: *${stats.todayRegistrations}*\n` +
    `🟢 Статус: ${events.active ? 'Активно' : '🔴 Неактивно'}`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '📊 Статистика', callback_data: 'stats' },
        { text: '📋 Записи', callback_data: 'regs_0' }
      ],
      [
        { text: '👥 Пользователи', callback_data: 'users_0' },
        { text: '🔍 Найти', callback_data: 'find_user' }
      ],
      [
        { text: '📢 Рассылка текста', callback_data: 'broadcast' },
        { text: '🖼 Рассылка фото', callback_data: 'broadcast_photo' }
      ],
      [
        { text: '📅 Мероприятие', callback_data: 'event_settings' },
        { text: '📥 Экспорт', callback_data: 'export' }
      ],
      [
        { text: '🚫 Заблокированные', callback_data: 'blocked_0' },
        { text: '🗑 Очистить записи', callback_data: 'clear_regs' }
      ]
    ]
  };

  if (messageId) {
    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (e) {
      await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
    }
  } else {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', reply_markup: keyboard });
  }
}

async function showStats(chatId, messageId) {
  const stats = getStats();

  const text =
    '📊 *ПОДРОБНАЯ СТАТИСТИКА*\n\n' +
    `👥 Всего пользователей: *${stats.totalUsers}*\n` +
    `🟢 Активных за неделю: *${stats.activeUsers}*\n` +
    `🚫 Заблокировано: *${stats.blockedUsers}*\n\n` +
    `📝 Всего записей: *${stats.totalRegistrations}*\n` +
    `📅 За сегодня: *${stats.todayRegistrations}*\n` +
    `📆 За неделю: *${stats.weekRegistrations}*\n\n` +
    `🎯 Мероприятие: ${events.active ? '🟢 Активно' : '🔴 Неактивно'}\n` +
    `📍 ${events.address}`;

  const keyboard = {
    inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'menu' }]]
  };

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function showRegistrations(chatId, messageId, page) {
  const perPage = 5;
  const total = registrations.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const items = registrations.slice().reverse().slice(start, start + perPage);

  let text = `📋 *ЗАПИСИ НА МЕРОПРИЯТИЕ*\n`;
  text += `Страница ${page + 1}/${totalPages} | Всего: ${total}\n\n`;

  if (items.length === 0) {
    text += '_Записей пока нет_';
  } else {
    items.forEach((r, i) => {
      const num = total - start - i;
      text += `*${num}. ${r.name}*\n`;
      text += `   🎂 ${r.age} лет | 📱 \`${r.phone}\`\n`;
      text += `   📅 ${formatDate(r.registeredAt)}\n\n`;
    });
  }

  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `regs_${page - 1}` });
  nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (start + perPage < total) nav.push({ text: '➡️', callback_data: `regs_${page + 1}` });

  const keyboard = {
    inline_keyboard: [
      nav,
      [{ text: '◀️ Назад', callback_data: 'menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function showUsers(chatId, messageId, page) {
  const perPage = 8;
  const total = users.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const items = users.slice().reverse().slice(start, start + perPage);

  let text = `👥 *ПОЛЬЗОВАТЕЛИ БОТА*\n`;
  text += `Страница ${page + 1}/${totalPages} | Всего: ${total}\n\n`;

  if (items.length === 0) {
    text += '_Пользователей пока нет_';
  } else {
    items.forEach((u, i) => {
      const num = total - start - i;
      const name = u.firstName || u.username || 'Без имени';
      const username = u.username ? ` @${u.username}` : '';
      const blocked = blockedUsers.includes(u.chatId) ? ' 🚫' : '';
      text += `${num}. ${name}${username}${blocked}\n`;
    });
  }

  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `users_${page - 1}` });
  nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (start + perPage < total) nav.push({ text: '➡️', callback_data: `users_${page + 1}` });

  const keyboard = {
    inline_keyboard: [
      nav,
      [{ text: '◀️ Назад', callback_data: 'menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function showBlocked(chatId, messageId, page) {
  const perPage = 10;
  const total = blockedUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = page * perPage;
  const items = blockedUsers.slice(start, start + perPage);

  let text = `🚫 *ЗАБЛОКИРОВАННЫЕ*\n`;
  text += `Страница ${page + 1}/${totalPages} | Всего: ${total}\n\n`;

  if (items.length === 0) {
    text += '_Нет заблокированных пользователей_';
  } else {
    items.forEach((id, i) => {
      const user = users.find(u => u.chatId === id);
      const name = user ? (user.firstName || user.username || id) : id;
      text += `${start + i + 1}. ${name} (ID: \`${id}\`)\n`;
    });
    text += '\n_Чтобы разблокировать, используйте /unblock ID_';
  }

  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `blocked_${page - 1}` });
  nav.push({ text: `${page + 1}/${totalPages}`, callback_data: 'noop' });
  if (start + perPage < total) nav.push({ text: '➡️', callback_data: `blocked_${page + 1}` });

  const keyboard = {
    inline_keyboard: [
      nav,
      [{ text: '◀️ Назад', callback_data: 'menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function showEventSettings(chatId, messageId) {
  const text =
    '📅 *НАСТРОЙКИ МЕРОПРИЯТИЯ*\n\n' +
    `📆 *День 1:* ${events.day1}\n` +
    `📆 *День 2:* ${events.day2}\n` +
    `📍 *Адрес:* ${events.address}\n` +
    `📝 *Описание:* ${events.description}\n\n` +
    `🔘 *Статус:* ${events.active ? '🟢 Запись открыта' : '🔴 Запись закрыта'}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ День 1', callback_data: 'edit_day1' }, { text: '✏️ День 2', callback_data: 'edit_day2' }],
      [{ text: '✏️ Адрес', callback_data: 'edit_address' }],
      [{ text: '✏️ Описание', callback_data: 'edit_desc' }],
      [{ text: events.active ? '🔴 Закрыть запись' : '🟢 Открыть запись', callback_data: 'toggle_event' }],
      [{ text: '◀️ Назад', callback_data: 'menu' }]
    ]
  };

  await bot.editMessageText(text, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function exportData(chatId) {
  if (registrations.length === 0) {
    return bot.sendMessage(chatId, '📋 Нет данных для экспорта.');
  }

  // CSV формат
  let csv = 'Имя,Возраст,Телефон,Дата записи\n';
  registrations.forEach(r => {
    csv += `"${r.name}",${r.age},"${r.phone}","${formatDate(r.registeredAt)}"\n`;
  });

  const buffer = Buffer.from(csv, 'utf8');
  const filename = `registrations_${new Date().toISOString().slice(0,10)}.csv`;

  await bot.sendDocument(chatId, buffer, {
    caption: `📥 Экспорт записей (${registrations.length} шт.)\n\nФормат: CSV (откроется в Excel)`
  }, {
    filename,
    contentType: 'text/csv'
  });
}

async function doBroadcast(chatId, content, isPhoto = false) {
  let sent = 0, failed = 0;
  const total = users.length;

  const statusMsg = await bot.sendMessage(chatId, `📤 Рассылка: 0/${total}...`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (blockedUsers.includes(user.chatId)) {
      failed++;
      continue;
    }

    try {
      if (isPhoto) {
        await bot.sendPhoto(user.chatId, content.photo, {
          caption: content.caption,
          parse_mode: 'Markdown'
        });
      } else {
        await bot.sendMessage(user.chatId, content, { parse_mode: 'Markdown' });
      }
      sent++;
    } catch (error) {
      failed++;
    }

    // Обновляем статус каждые 10 сообщений
    if ((i + 1) % 10 === 0) {
      try {
        await bot.editMessageText(`📤 Рассылка: ${i + 1}/${total}...`, {
          chat_id: chatId,
          message_id: statusMsg.message_id
        });
      } catch (e) {}
    }

    await new Promise(r => setTimeout(r, 35)); // Задержка для API
  }

  await bot.editMessageText(
    `✅ *Рассылка завершена!*\n\n📨 Доставлено: ${sent}\n❌ Не доставлено: ${failed}`,
    { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
  );
}

// ==================== CALLBACK HANDLER ====================

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (!isAdmin(chatId)) {
    return bot.answerCallbackQuery(query.id, { text: '⛔ Нет доступа', show_alert: true });
  }

  await bot.answerCallbackQuery(query.id);

  // Парсинг callback data
  const [action, param] = data.split('_');
  const page = parseInt(param) || 0;

  try {
    switch (data) {
      case 'menu':
        await showAdminMenu(chatId, messageId);
        break;

      case 'stats':
        await showStats(chatId, messageId);
        break;

      case 'broadcast':
        userSessions[chatId] = { state: STATES.ADMIN_BROADCAST };
        await bot.sendMessage(chatId,
          '📢 *РАССЫЛКА ТЕКСТА*\n\n' +
          'Отправьте текст для рассылки всем пользователям.\n' +
          'Поддерживается *Markdown* форматирование.\n\n' +
          '❌ Для отмены: /cancel',
          { parse_mode: 'Markdown' }
        );
        break;

      case 'broadcast_photo':
        userSessions[chatId] = { state: STATES.ADMIN_BROADCAST_PHOTO };
        await bot.sendMessage(chatId,
          '🖼 *РАССЫЛКА ФОТО*\n\n' +
          'Отправьте фото с подписью для рассылки.\n\n' +
          '❌ Для отмены: /cancel',
          { parse_mode: 'Markdown' }
        );
        break;

      case 'event_settings':
        await showEventSettings(chatId, messageId);
        break;

      case 'toggle_event':
        events.active = !events.active;
        saveData(EVENTS_FILE, events);
        await showEventSettings(chatId, messageId);
        break;

      case 'edit_day1':
        userSessions[chatId] = { state: STATES.ADMIN_EDIT_DAY1 };
        await bot.sendMessage(chatId, `✏️ Введите новую дату для *Дня 1*\n\nТекущее: ${events.day1}\n\n/cancel для отмены`, { parse_mode: 'Markdown' });
        break;

      case 'edit_day2':
        userSessions[chatId] = { state: STATES.ADMIN_EDIT_DAY2 };
        await bot.sendMessage(chatId, `✏️ Введите новую дату для *Дня 2*\n\nТекущее: ${events.day2}\n\n/cancel для отмены`, { parse_mode: 'Markdown' });
        break;

      case 'edit_address':
        userSessions[chatId] = { state: STATES.ADMIN_EDIT_ADDRESS };
        await bot.sendMessage(chatId, `✏️ Введите новый *адрес*\n\nТекущий: ${events.address}\n\n/cancel для отмены`, { parse_mode: 'Markdown' });
        break;

      case 'edit_desc':
        userSessions[chatId] = { state: STATES.ADMIN_EDIT_DESCRIPTION };
        await bot.sendMessage(chatId, `✏️ Введите новое *описание*\n\nТекущее: ${events.description}\n\n/cancel для отмены`, { parse_mode: 'Markdown' });
        break;

      case 'export':
        await exportData(chatId);
        break;

      case 'find_user':
        userSessions[chatId] = { state: STATES.ADMIN_FIND_USER };
        await bot.sendMessage(chatId, '🔍 Введите имя, @username или ID пользователя для поиска:\n\n/cancel для отмены');
        break;

      case 'clear_regs':
        await bot.editMessageText(
          '🗑 *ОЧИСТКА ЗАПИСЕЙ*\n\n⚠️ Вы уверены, что хотите удалить ВСЕ записи на мероприятие?\n\nЭто действие нельзя отменить!',
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Да, удалить всё', callback_data: 'confirm_clear' }],
                [{ text: '❌ Отмена', callback_data: 'menu' }]
              ]
            }
          }
        );
        break;

      case 'confirm_clear':
        registrations = [];
        saveData(REGISTRATIONS_FILE, registrations);
        await bot.editMessageText('✅ Все записи удалены!', { chat_id: chatId, message_id: messageId });
        setTimeout(() => showAdminMenu(chatId), 1500);
        break;

      case 'noop':
        break;

      default:
        // Пагинация
        if (data.startsWith('regs_')) {
          await showRegistrations(chatId, messageId, page);
        } else if (data.startsWith('users_')) {
          await showUsers(chatId, messageId, page);
        } else if (data.startsWith('blocked_')) {
          await showBlocked(chatId, messageId, page);
        } else if (data.startsWith('block_')) {
          const id = parseInt(data.replace('block_', ''));
          if (!blockedUsers.includes(id)) {
            blockedUsers.push(id);
            saveData(BLOCKED_FILE, blockedUsers);
          }
          await bot.answerCallbackQuery(query.id, { text: '🚫 Пользователь заблокирован' });
        } else if (data.startsWith('unblock_')) {
          const id = parseInt(data.replace('unblock_', ''));
          blockedUsers = blockedUsers.filter(b => b !== id);
          saveData(BLOCKED_FILE, blockedUsers);
          await bot.answerCallbackQuery(query.id, { text: '✅ Пользователь разблокирован' });
        }
    }
  } catch (error) {
    console.error('Callback error:', error.message);
  }
});

// ==================== КОМАНДЫ ====================

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  if (isBlocked(chatId)) {
    return bot.sendMessage(chatId, '⛔ Вы заблокированы.');
  }

  addUser(chatId, msg.from.username, msg.from.first_name, msg.from.last_name);

  if (!events.active) {
    return bot.sendMessage(chatId,
      '✨ Здравствуйте! Добро пожаловать в *ПСИХОМИР*! ✨\n\n' +
      '🌿 ' + events.description + '\n\n' +
      '⏸ К сожалению, запись на мероприятие сейчас закрыта.\n\n' +
      '🔔 Следите за обновлениями!',
      { parse_mode: 'Markdown' }
    );
  }

  userSessions[chatId] = { state: STATES.WAITING_NAME, data: {} };

  await bot.sendMessage(chatId,
    '✨ Здравствуйте! Добро пожаловать в *ПСИХОМИР*! ✨\n\n' +
    '🌿 ' + events.description + '\n\n' +
    '📝 Я помогу вам записаться на мероприятие!\n\n' +
    '👤 Для начала, пожалуйста, введите ваше имя:',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/admin/, (msg) => {
  if (isAdmin(msg.chat.id)) {
    showAdminMenu(msg.chat.id);
  }
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  if (userSessions[chatId]) {
    delete userSessions[chatId];
    bot.sendMessage(chatId, '❌ Действие отменено.');
    if (isAdmin(chatId)) {
      showAdminMenu(chatId);
    }
  }
});

bot.onText(/\/block (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const id = parseInt(match[1]);
  if (!blockedUsers.includes(id)) {
    blockedUsers.push(id);
    saveData(BLOCKED_FILE, blockedUsers);
    bot.sendMessage(msg.chat.id, `🚫 Пользователь ${id} заблокирован`);
  }
});

bot.onText(/\/unblock (\d+)/, (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const id = parseInt(match[1]);
  blockedUsers = blockedUsers.filter(b => b !== id);
  saveData(BLOCKED_FILE, blockedUsers);
  bot.sendMessage(msg.chat.id, `✅ Пользователь ${id} разблокирован`);
});

bot.onText(/\/send (\d+) (.+)/, async (msg, match) => {
  if (!isAdmin(msg.chat.id)) return;
  const id = parseInt(match[1]);
  const text = match[2];
  try {
    await bot.sendMessage(id, text, { parse_mode: 'Markdown' });
    bot.sendMessage(msg.chat.id, `✅ Сообщение отправлено пользователю ${id}`);
  } catch (e) {
    bot.sendMessage(msg.chat.id, `❌ Не удалось отправить: ${e.message}`);
  }
});

bot.onText(/\/stats/, (msg) => {
  if (!isAdmin(msg.chat.id)) return;
  const s = getStats();
  bot.sendMessage(msg.chat.id,
    `📊 *Быстрая статистика*\n\n👥 ${s.totalUsers} | 📝 ${s.totalRegistrations} | 📅 ${s.todayRegistrations} сегодня`,
    { parse_mode: 'Markdown' }
  );
});

// ==================== ОБРАБОТКА СООБЩЕНИЙ ====================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text?.startsWith('/')) return;
  if (isBlocked(chatId)) return;

  const session = userSessions[chatId];
  if (!session) {
    return bot.sendMessage(chatId, '👋 Нажмите /start чтобы начать');
  }

  // Админские состояния
  if (isAdmin(chatId)) {
    switch (session.state) {
      case STATES.ADMIN_BROADCAST:
        await doBroadcast(chatId, text);
        delete userSessions[chatId];
        return;

      case STATES.ADMIN_BROADCAST_PHOTO:
        if (msg.photo) {
          const photo = msg.photo[msg.photo.length - 1].file_id;
          await doBroadcast(chatId, { photo, caption: msg.caption || '' }, true);
          delete userSessions[chatId];
        } else {
          bot.sendMessage(chatId, '❗ Отправьте фото');
        }
        return;

      case STATES.ADMIN_EDIT_DAY1:
        events.day1 = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ День 1 обновлен!');
        showAdminMenu(chatId);
        return;

      case STATES.ADMIN_EDIT_DAY2:
        events.day2 = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ День 2 обновлен!');
        showAdminMenu(chatId);
        return;

      case STATES.ADMIN_EDIT_ADDRESS:
        events.address = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ Адрес обновлен!');
        showAdminMenu(chatId);
        return;

      case STATES.ADMIN_EDIT_DESCRIPTION:
        events.description = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ Описание обновлено!');
        showAdminMenu(chatId);
        return;

      case STATES.ADMIN_FIND_USER:
        const query = text.toLowerCase();
        const found = users.filter(u => {
          const name = (u.firstName || '').toLowerCase();
          const uname = (u.username || '').toLowerCase();
          const id = u.chatId.toString();
          return name.includes(query) || uname.includes(query) || id.includes(query);
        }).slice(0, 10);

        if (found.length === 0) {
          bot.sendMessage(chatId, '🔍 Никого не найдено');
        } else {
          let result = '🔍 *Результаты поиска:*\n\n';
          found.forEach(u => {
            const name = u.firstName || 'Без имени';
            const username = u.username ? ` @${u.username}` : '';
            const blocked = blockedUsers.includes(u.chatId) ? ' 🚫' : '';
            result += `• ${name}${username}${blocked}\n  ID: \`${u.chatId}\`\n\n`;
          });
          result += '_Команды: /block ID, /unblock ID, /send ID текст_';
          bot.sendMessage(chatId, result, { parse_mode: 'Markdown' });
        }
        delete userSessions[chatId];
        return;
    }
  }

  // Пользовательские состояния
  switch (session.state) {
    case STATES.WAITING_NAME:
      if (!text?.trim()) {
        return bot.sendMessage(chatId, '❗ Введите ваше имя:');
      }
      session.data.name = text.trim();
      session.state = STATES.WAITING_AGE;
      bot.sendMessage(chatId, '✅ Отлично!\n\n🎂 Укажите ваш возраст:');
      break;

    case STATES.WAITING_AGE:
      const ageResult = validateAge(text);
      if (!ageResult.valid) {
        return bot.sendMessage(chatId, ageResult.message);
      }
      session.data.age = ageResult.value;
      session.state = STATES.WAITING_PHONE;
      bot.sendMessage(chatId, '✅ Отлично!\n\n📱 Укажите ваш номер телефона:');
      break;

    case STATES.WAITING_PHONE:
      const phoneResult = validatePhone(text);
      if (!phoneResult.valid) {
        return bot.sendMessage(chatId, phoneResult.message);
      }
      session.data.phone = phoneResult.value;

      // Сохраняем
      addRegistration(chatId, session.data);

      // Подтверждение пользователю
      await bot.sendMessage(chatId,
        `🎉 *${session.data.name}*, вы успешно записаны!\n\n` +
        `📅 День 1: ${events.day1}\n` +
        `📅 День 2: ${events.day2}\n\n` +
        `📍 Адрес: ${events.address}\n\n` +
        `💚 До встречи!`,
        { parse_mode: 'Markdown' }
      );

      // Уведомление админу
      if (adminChatId) {
        const user = users.find(u => u.chatId === chatId);
        const username = user?.username ? ` (@${user.username})` : '';
        try {
          await bot.sendMessage(adminChatId,
            `🔔 *Новая запись!*\n\n` +
            `👤 ${session.data.name}${username}\n` +
            `🎂 ${session.data.age} лет\n` +
            `📱 ${session.data.phone}\n` +
            `🆔 \`${chatId}\`\n\n` +
            `📊 Всего записей: ${registrations.length}`,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [[
                  { text: '🚫 Заблокировать', callback_data: `block_${chatId}` },
                  { text: '📋 Все записи', callback_data: 'regs_0' }
                ]]
              }
            }
          );
        } catch (e) {}
      }

      delete userSessions[chatId];

      setTimeout(() => {
        bot.sendMessage(chatId, '✨ Хотите записать кого-то еще? Нажмите /start');
      }, 2000);
      break;
  }
});

// ==================== ОШИБКИ ====================

bot.on('polling_error', (error) => {
  console.error('Polling error:', error.message);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

console.log('🚀 ПСИХОМИР бот запущен!');
console.log(`📊 Пользователей: ${users.length} | Записей: ${registrations.length}`);

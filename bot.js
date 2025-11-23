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

// Создаем папку data если не существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== БАЗА ДАННЫХ ====================

// Загрузка данных из файла
function loadData(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Ошибка загрузки ${filePath}:`, error.message);
  }
  return defaultValue;
}

// Сохранение данных в файл
function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error(`Ошибка сохранения ${filePath}:`, error.message);
  }
}

// Загрузка всех данных
let users = loadData(USERS_FILE, []);
let registrations = loadData(REGISTRATIONS_FILE, []);
let events = loadData(EVENTS_FILE, {
  day1: '22.11.2025 с 11:00 до 15:00',
  day2: '23.11.2025 с 11:00 до 15:00',
  address: 'ул. Студенческая, д. 35',
  active: true
});

// Хранилище сессий (в памяти)
const userSessions = {};

// ==================== КОНСТАНТЫ ====================

const MIN_AGE = 18;
const MAX_AGE = 100;

// Состояния диалога
const STATES = {
  WAITING_NAME: 'waiting_name',
  WAITING_AGE: 'waiting_age',
  WAITING_PHONE: 'waiting_phone',
  ADMIN_BROADCAST: 'admin_broadcast',
  ADMIN_EDIT_DAY1: 'admin_edit_day1',
  ADMIN_EDIT_DAY2: 'admin_edit_day2',
  ADMIN_EDIT_ADDRESS: 'admin_edit_address'
};

// ==================== УТИЛИТЫ ====================

// Проверка администратора
function isAdmin(chatId) {
  return chatId.toString() === adminChatId;
}

// Добавление пользователя в базу
function addUser(chatId, username, firstName) {
  const existingUser = users.find(u => u.chatId === chatId);
  if (!existingUser) {
    users.push({
      chatId,
      username: username || null,
      firstName: firstName || null,
      joinedAt: new Date().toISOString()
    });
    saveData(USERS_FILE, users);
  }
}

// Добавление записи на мероприятие
function addRegistration(chatId, userData) {
  registrations.push({
    id: registrations.length + 1,
    chatId,
    ...userData,
    registeredAt: new Date().toISOString()
  });
  saveData(REGISTRATIONS_FILE, registrations);
}

// Валидация возраста
function validateAge(age) {
  const ageNum = parseInt(age);
  if (isNaN(ageNum)) {
    return { valid: false, message: '❗ Пожалуйста, введите число.' };
  }
  if (ageNum < MIN_AGE || ageNum > MAX_AGE) {
    return {
      valid: false,
      message: `❗ Возраст должен быть от ${MIN_AGE} до ${MAX_AGE} лет.`
    };
  }
  return { valid: true, value: ageNum };
}

// Валидация телефона (упрощенная)
function validatePhone(phone) {
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Принимаем любой номер от 10 цифр
  if (cleaned.replace(/\D/g, '').length < 10) {
    return {
      valid: false,
      message: '❗ Пожалуйста, введите корректный номер телефона.'
    };
  }

  return { valid: true, value: phone.trim() };
}

// Форматирование даты
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==================== АДМИН-ПАНЕЛЬ ====================

// Главное меню админки
function showAdminMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: '📊 Статистика', callback_data: 'admin_stats' }],
      [{ text: '📋 Список записей', callback_data: 'admin_registrations' }],
      [{ text: '👥 Все пользователи', callback_data: 'admin_users' }],
      [{ text: '📢 Рассылка', callback_data: 'admin_broadcast' }],
      [{ text: '📅 Настройки мероприятия', callback_data: 'admin_event_settings' }],
      [{ text: '🔄 Экспорт данных', callback_data: 'admin_export' }]
    ]
  };

  bot.sendMessage(chatId, '🔐 *Админ-панель ПСИХОМИР*\n\nВыберите действие:', {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Показать статистику
function showStats(chatId) {
  const totalUsers = users.length;
  const totalRegistrations = registrations.length;
  const todayRegistrations = registrations.filter(r => {
    const regDate = new Date(r.registeredAt).toDateString();
    const today = new Date().toDateString();
    return regDate === today;
  }).length;

  const message =
    '📊 *Статистика бота*\n\n' +
    `👥 Всего пользователей: *${totalUsers}*\n` +
    `📝 Всего записей: *${totalRegistrations}*\n` +
    `📅 Записей сегодня: *${todayRegistrations}*\n\n` +
    `🟢 Статус мероприятия: ${events.active ? 'Активно' : 'Неактивно'}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '◀️ Назад', callback_data: 'admin_menu' }]
    ]
  };

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Показать записи
function showRegistrations(chatId, page = 0) {
  const perPage = 5;
  const start = page * perPage;
  const end = start + perPage;
  const pageRegistrations = registrations.slice().reverse().slice(start, end);
  const totalPages = Math.ceil(registrations.length / perPage);

  if (registrations.length === 0) {
    bot.sendMessage(chatId, '📋 Записей пока нет.', {
      reply_markup: {
        inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'admin_menu' }]]
      }
    });
    return;
  }

  let message = `📋 *Записи на мероприятие* (стр. ${page + 1}/${totalPages})\n\n`;

  pageRegistrations.forEach((reg, i) => {
    message += `*${start + i + 1}. ${reg.name}*\n`;
    message += `   🎂 ${reg.age} лет | 📱 ${reg.phone}\n`;
    message += `   📅 ${formatDate(reg.registeredAt)}\n\n`;
  });

  const keyboard = {
    inline_keyboard: []
  };

  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: '⬅️ Пред.', callback_data: `admin_reg_page_${page - 1}` });
  }
  if (end < registrations.length) {
    navButtons.push({ text: '➡️ След.', callback_data: `admin_reg_page_${page + 1}` });
  }
  if (navButtons.length > 0) {
    keyboard.inline_keyboard.push(navButtons);
  }
  keyboard.inline_keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_menu' }]);

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Показать пользователей
function showUsers(chatId, page = 0) {
  const perPage = 10;
  const start = page * perPage;
  const end = start + perPage;
  const pageUsers = users.slice().reverse().slice(start, end);
  const totalPages = Math.ceil(users.length / perPage);

  if (users.length === 0) {
    bot.sendMessage(chatId, '👥 Пользователей пока нет.', {
      reply_markup: {
        inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'admin_menu' }]]
      }
    });
    return;
  }

  let message = `👥 *Пользователи бота* (стр. ${page + 1}/${totalPages})\n\n`;

  pageUsers.forEach((user, i) => {
    const name = user.firstName || user.username || 'Без имени';
    message += `${start + i + 1}. ${name}`;
    if (user.username) message += ` (@${user.username})`;
    message += `\n`;
  });

  const keyboard = {
    inline_keyboard: []
  };

  const navButtons = [];
  if (page > 0) {
    navButtons.push({ text: '⬅️ Пред.', callback_data: `admin_users_page_${page - 1}` });
  }
  if (end < users.length) {
    navButtons.push({ text: '➡️ След.', callback_data: `admin_users_page_${page + 1}` });
  }
  if (navButtons.length > 0) {
    keyboard.inline_keyboard.push(navButtons);
  }
  keyboard.inline_keyboard.push([{ text: '◀️ Назад', callback_data: 'admin_menu' }]);

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Настройки мероприятия
function showEventSettings(chatId) {
  const message =
    '📅 *Настройки мероприятия*\n\n' +
    `📆 День 1: ${events.day1}\n` +
    `📆 День 2: ${events.day2}\n` +
    `📍 Адрес: ${events.address}\n` +
    `🔘 Статус: ${events.active ? '🟢 Активно' : '🔴 Неактивно'}`;

  const keyboard = {
    inline_keyboard: [
      [{ text: '✏️ Изменить День 1', callback_data: 'admin_edit_day1' }],
      [{ text: '✏️ Изменить День 2', callback_data: 'admin_edit_day2' }],
      [{ text: '✏️ Изменить адрес', callback_data: 'admin_edit_address' }],
      [{ text: events.active ? '🔴 Деактивировать' : '🟢 Активировать', callback_data: 'admin_toggle_event' }],
      [{ text: '◀️ Назад', callback_data: 'admin_menu' }]
    ]
  };

  bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

// Экспорт данных
function exportData(chatId) {
  const exportText = registrations.map(r =>
    `${r.name}\t${r.age}\t${r.phone}\t${formatDate(r.registeredAt)}`
  ).join('\n');

  const header = 'Имя\tВозраст\tТелефон\tДата записи\n';
  const fullExport = header + exportText;

  // Отправляем как файл
  const buffer = Buffer.from(fullExport, 'utf8');
  bot.sendDocument(chatId, buffer, {
    caption: '📥 Экспорт записей на мероприятие'
  }, {
    filename: `registrations_${new Date().toISOString().slice(0,10)}.txt`,
    contentType: 'text/plain'
  });
}

// ==================== ОБРАБОТЧИКИ CALLBACK ====================

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  // Проверяем права админа
  if (!isAdmin(chatId)) {
    bot.answerCallbackQuery(query.id, { text: '⛔ Доступ запрещен' });
    return;
  }

  bot.answerCallbackQuery(query.id);

  // Обработка callback
  switch (data) {
    case 'admin_menu':
      showAdminMenu(chatId);
      break;

    case 'admin_stats':
      showStats(chatId);
      break;

    case 'admin_registrations':
      showRegistrations(chatId, 0);
      break;

    case 'admin_users':
      showUsers(chatId, 0);
      break;

    case 'admin_broadcast':
      userSessions[chatId] = { state: STATES.ADMIN_BROADCAST };
      bot.sendMessage(chatId,
        '📢 *Рассылка сообщения*\n\n' +
        'Отправьте текст, который хотите разослать всем пользователям.\n\n' +
        'Поддерживается форматирование Markdown.\n' +
        'Для отмены отправьте /cancel',
        { parse_mode: 'Markdown' }
      );
      break;

    case 'admin_event_settings':
      showEventSettings(chatId);
      break;

    case 'admin_edit_day1':
      userSessions[chatId] = { state: STATES.ADMIN_EDIT_DAY1 };
      bot.sendMessage(chatId,
        '✏️ Введите новую дату и время для *Дня 1*:\n\n' +
        `Текущее значение: ${events.day1}\n\n` +
        'Для отмены отправьте /cancel',
        { parse_mode: 'Markdown' }
      );
      break;

    case 'admin_edit_day2':
      userSessions[chatId] = { state: STATES.ADMIN_EDIT_DAY2 };
      bot.sendMessage(chatId,
        '✏️ Введите новую дату и время для *Дня 2*:\n\n' +
        `Текущее значение: ${events.day2}\n\n` +
        'Для отмены отправьте /cancel',
        { parse_mode: 'Markdown' }
      );
      break;

    case 'admin_edit_address':
      userSessions[chatId] = { state: STATES.ADMIN_EDIT_ADDRESS };
      bot.sendMessage(chatId,
        '✏️ Введите новый *адрес* мероприятия:\n\n' +
        `Текущее значение: ${events.address}\n\n` +
        'Для отмены отправьте /cancel',
        { parse_mode: 'Markdown' }
      );
      break;

    case 'admin_toggle_event':
      events.active = !events.active;
      saveData(EVENTS_FILE, events);
      showEventSettings(chatId);
      break;

    case 'admin_export':
      if (registrations.length === 0) {
        bot.sendMessage(chatId, '📋 Нет данных для экспорта.', {
          reply_markup: {
            inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'admin_menu' }]]
          }
        });
      } else {
        exportData(chatId);
      }
      break;

    default:
      // Пагинация записей
      if (data.startsWith('admin_reg_page_')) {
        const page = parseInt(data.replace('admin_reg_page_', ''));
        showRegistrations(chatId, page);
      }
      // Пагинация пользователей
      if (data.startsWith('admin_users_page_')) {
        const page = parseInt(data.replace('admin_users_page_', ''));
        showUsers(chatId, page);
      }
  }
});

// ==================== КОМАНДЫ ====================

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Добавляем пользователя в базу
  addUser(chatId, msg.from.username, msg.from.first_name);

  // Инициализация сессии
  userSessions[chatId] = {
    state: STATES.WAITING_NAME,
    data: {}
  };

  bot.sendMessage(
    chatId,
    '✨ Здравствуйте! Добро пожаловать в ПСИХОМИР! ✨\n\n' +
    '🌿 Пространство психологических программ и оздоровительных практик, где Вы сможете познакомиться с множеством специально подобранных эффективных практик, которые гармонично сочетаются между собой, дополняя друг друга и делая жизнь счастливее.\n\n' +
    '📝 Я помогу вам записаться на мероприятие!\n\n' +
    '👤 Для начала, пожалуйста, введите ваше имя:'
  );
});

// Команда /admin - открыть админ-панель
bot.onText(/\/admin/, (msg) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    bot.sendMessage(chatId, '⛔ У вас нет доступа к админ-панели.');
    return;
  }

  showAdminMenu(chatId);
});

// Команда /cancel - отмена текущего действия
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

// Команда /broadcast - быстрая рассылка (только для админа)
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;

  if (!isAdmin(chatId)) {
    return;
  }

  const text = match[1];
  await doBroadcast(chatId, text);
});

// Функция рассылки
async function doBroadcast(adminChatId, text) {
  let sent = 0;
  let failed = 0;

  bot.sendMessage(adminChatId, '📤 Начинаю рассылку...');

  for (const user of users) {
    try {
      await bot.sendMessage(user.chatId, text, { parse_mode: 'Markdown' });
      sent++;
      // Небольшая задержка чтобы не превысить лимиты API
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      failed++;
      console.error(`Не удалось отправить сообщение ${user.chatId}:`, error.message);
    }
  }

  bot.sendMessage(adminChatId,
    `✅ Рассылка завершена!\n\n` +
    `📨 Отправлено: ${sent}\n` +
    `❌ Не доставлено: ${failed}`
  );
}

// ==================== ОБРАБОТКА СООБЩЕНИЙ ====================

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Игнорируем команды
  if (text && text.startsWith('/')) {
    return;
  }

  // Проверяем наличие сессии
  if (!userSessions[chatId]) {
    bot.sendMessage(chatId, '👋 Пожалуйста, начните с команды /start');
    return;
  }

  const session = userSessions[chatId];

  // Обработка админских состояний
  if (isAdmin(chatId)) {
    switch (session.state) {
      case STATES.ADMIN_BROADCAST:
        await doBroadcast(chatId, text);
        delete userSessions[chatId];
        return;

      case STATES.ADMIN_EDIT_DAY1:
        events.day1 = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ День 1 обновлен!');
        showEventSettings(chatId);
        return;

      case STATES.ADMIN_EDIT_DAY2:
        events.day2 = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ День 2 обновлен!');
        showEventSettings(chatId);
        return;

      case STATES.ADMIN_EDIT_ADDRESS:
        events.address = text;
        saveData(EVENTS_FILE, events);
        delete userSessions[chatId];
        bot.sendMessage(chatId, '✅ Адрес обновлен!');
        showEventSettings(chatId);
        return;
    }
  }

  // Обработка пользовательских состояний
  switch (session.state) {
    case STATES.WAITING_NAME:
      handleName(chatId, text);
      break;

    case STATES.WAITING_AGE:
      handleAge(chatId, text);
      break;

    case STATES.WAITING_PHONE:
      handlePhone(chatId, text);
      break;
  }
});

// ==================== ОБРАБОТЧИКИ ПОЛЬЗОВАТЕЛЯ ====================

function handleName(chatId, name) {
  if (!name || name.trim().length === 0) {
    bot.sendMessage(chatId, '❗ Имя не может быть пустым. Пожалуйста, введите ваше имя:');
    return;
  }

  userSessions[chatId].data.name = name.trim();
  userSessions[chatId].state = STATES.WAITING_AGE;

  bot.sendMessage(chatId, '✅ Отлично!\n\n🎂 Укажите ваш возраст:');
}

function handleAge(chatId, age) {
  const validation = validateAge(age);

  if (!validation.valid) {
    bot.sendMessage(chatId, validation.message);
    return;
  }

  userSessions[chatId].data.age = validation.value;
  userSessions[chatId].state = STATES.WAITING_PHONE;

  bot.sendMessage(chatId, '✅ Отлично!\n\n📱 Укажите ваш номер телефона:');
}

async function handlePhone(chatId, phone) {
  const validation = validatePhone(phone);

  if (!validation.valid) {
    bot.sendMessage(chatId, validation.message);
    return;
  }

  userSessions[chatId].data.phone = validation.value;

  const userData = userSessions[chatId].data;

  // Сохраняем запись в базу
  addRegistration(chatId, userData);

  // Отправляем подтверждение пользователю
  await bot.sendMessage(
    chatId,
    `🎉 ${userData.name}, вы успешно записаны на мероприятие!\n\n` +
    `📅 Первый день: ${events.day1}\n` +
    `📅 Второй день: ${events.day2}\n\n` +
    `📍 Адрес: ${events.address}\n\n` +
    `💚 До встречи!`
  );

  // Уведомление администратору
  if (adminChatId) {
    const adminMessage =
      '🔔 Новая запись на мероприятие!\n\n' +
      `👤 Имя: ${userData.name}\n` +
      `🎂 Возраст: ${userData.age} лет\n` +
      `📱 Телефон: ${userData.phone}\n\n` +
      `📅 Первый день: ${events.day1}\n` +
      `📅 Второй день: ${events.day2}\n` +
      `📍 Адрес: ${events.address}`;

    try {
      await bot.sendMessage(adminChatId, adminMessage);
    } catch (error) {
      console.error('Ошибка уведомления админу:', error.message);
    }
  }

  delete userSessions[chatId];

  setTimeout(() => {
    bot.sendMessage(chatId, '✨ Если хотите записать еще кого-то, используйте команду /start');
  }, 2000);
}

// ==================== ОБРАБОТКА ОШИБОК ====================

bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
});

console.log('🚀 Бот ПСИХОМИР запущен и готов к работе!');
console.log('📊 Загружено пользователей:', users.length);
console.log('📝 Загружено записей:', registrations.length);

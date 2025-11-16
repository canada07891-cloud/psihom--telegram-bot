require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

// Конфигурация
const token = process.env.BOT_TOKEN;
const adminChatId = process.env.ADMIN_CHAT_ID;

// Создание бота
const bot = new TelegramBot(token, { polling: true });

// Хранилище данных пользователей (в памяти)
const userSessions = {};

// Константы
const MIN_AGE = 18;
const MAX_AGE = 100;
const EVENT_DAY1 = '22.11.2025 с 11:00 до 15:00';
const EVENT_DAY2 = '23.11.2025 с 11:00 до 15:00';
const EVENT_ADDRESS = 'ул. Студенческая, д. 35';

// Состояния диалога
const STATES = {
  WAITING_NAME: 'waiting_name',
  WAITING_AGE: 'waiting_age',
  WAITING_PHONE: 'waiting_phone'
};

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Инициализация сессии пользователя
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

// Валидация возраста
function validateAge(age) {
  const ageNum = parseInt(age);
  if (isNaN(ageNum)) {
    return { valid: false, message: 'Пожалуйста, введите корректное число.' };
  }
  if (ageNum < MIN_AGE || ageNum > MAX_AGE) {
    return {
      valid: false,
      message: `Возраст должен быть в диапазоне от ${MIN_AGE} до ${MAX_AGE} лет.`
    };
  }
  return { valid: true, value: ageNum };
}

// Валидация телефона
function validatePhone(phone) {
  // Убираем все символы кроме цифр и +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Проверяем формат
  const phoneRegex = /^(\+7|8)\d{10}$/;

  if (!phoneRegex.test(cleaned)) {
    return {
      valid: false,
      message: 'Неверный формат телефона. Пожалуйста, введите номер в формате +79991234567 или 89991234567'
    };
  }

  // Нормализуем к формату +7
  let normalized = cleaned;
  if (normalized.startsWith('8')) {
    normalized = '+7' + normalized.slice(1);
  }

  return { valid: true, value: normalized };
}

// Обработчик всех текстовых сообщений
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Игнорируем команды
  if (text && text.startsWith('/')) {
    return;
  }

  // Проверяем наличие сессии
  if (!userSessions[chatId]) {
    bot.sendMessage(
      chatId,
      '👋 Пожалуйста, начните с команды /start'
    );
    return;
  }

  const session = userSessions[chatId];

  // Обработка в зависимости от состояния
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

// Обработчик имени
function handleName(chatId, name) {
  if (!name || name.trim().length === 0) {
    bot.sendMessage(chatId, '❗ Имя не может быть пустым. Пожалуйста, введите ваше имя:');
    return;
  }

  userSessions[chatId].data.name = name.trim();
  userSessions[chatId].state = STATES.WAITING_AGE;

  bot.sendMessage(
    chatId,
    '✅ Отлично!\n\n🎂 Укажите ваш возраст:'
  );
}

// Обработчик возраста
function handleAge(chatId, age) {
  const validation = validateAge(age);

  if (!validation.valid) {
    bot.sendMessage(chatId, validation.message);
    return;
  }

  userSessions[chatId].data.age = validation.value;
  userSessions[chatId].state = STATES.WAITING_PHONE;

  bot.sendMessage(
    chatId,
    '✅ Отлично!\n\n📱 Укажите ваш номер телефона:'
  );
}

// Обработчик телефона
async function handlePhone(chatId, phone) {
  const validation = validatePhone(phone);

  if (!validation.valid) {
    bot.sendMessage(chatId, validation.message);
    return;
  }

  userSessions[chatId].data.phone = validation.value;

  // Получаем все данные пользователя
  const userData = userSessions[chatId].data;

  // Отправляем подтверждение пользователю
  await bot.sendMessage(
    chatId,
    `🎉 ${userData.name}, вы успешно записаны на мероприятие!\n\n` +
    `📅 Первый день: ${EVENT_DAY1}\n` +
    `📅 Второй день: ${EVENT_DAY2}\n\n` +
    `📍 Адрес: ${EVENT_ADDRESS}\n\n` +
    `💚 До встречи!`
  );

  // Отправляем уведомление администратору
  if (adminChatId) {
    const adminMessage =
      '🔔 Новая запись на мероприятие!\n\n' +
      `👤 Имя: ${userData.name}\n` +
      `🎂 Возраст: ${userData.age} лет\n` +
      `📱 Телефон: ${userData.phone}\n\n` +
      `📅 Первый день: ${EVENT_DAY1}\n` +
      `📅 Второй день: ${EVENT_DAY2}\n` +
      `📍 Адрес: ${EVENT_ADDRESS}`;

    try {
      await bot.sendMessage(adminChatId, adminMessage);
    } catch (error) {
      console.error('Ошибка при отправке уведомления администратору:', error.message);
    }
  }

  // Очищаем сессию пользователя
  delete userSessions[chatId];

  // Предлагаем записаться снова
  setTimeout(() => {
    bot.sendMessage(
      chatId,
      '✨ Если хотите записать еще кого-то, используйте команду /start'
    );
  }, 2000);
}

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('Ошибка polling:', error.message);
});

console.log('Бот ПСИХОМИР запущен и готов к работе!');

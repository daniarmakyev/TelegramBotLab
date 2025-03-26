import { Telegraf } from "telegraf";
import { config } from "dotenv";
import { WebSocketServer } from "ws";

config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const wss = new WebSocketServer({ port: 8080 });

const TEACHER_USERNAME = "daniarmakyev";
let activeUsers = new Set();

function isTeacher(ctx) {
  return ctx.from?.username === TEACHER_USERNAME;
}


function isCommand(message) {
  return message?.text?.startsWith('/') || false;
}


async function forwardToStudents(ctx) {
  if (isCommand(ctx.message)) return; 
  
  const message = ctx.message;

  activeUsers.forEach(chatId => {
    sendMessageToUser(chatId, message).catch(() => {});
  });

  await ctx.reply(`Сообщение отправлено ${activeUsers.size} студентам`);
}

// Универсальная отправка сообщений
async function sendMessageToUser(chatId, message) {
  if (message.text) {
    return bot.telegram.sendMessage(chatId, `📌 Задание:\n${message.text}`);
  } 
  if (message.photo) {
    return bot.telegram.sendPhoto(chatId, message.photo.slice(-1)[0].file_id, {
      caption: message.caption
    });
  }
  if (message.document) {
    return bot.telegram.sendDocument(chatId, message.document.file_id, {
      caption: message.caption
    });
  }
  if (message.video) {
    return bot.telegram.sendVideo(chatId, message.video.file_id, {
      caption: message.caption
    });
  }
}

bot.start((ctx) => {
  if (isTeacher(ctx)) {
    ctx.reply(
      `Добро пожаловать!\n` + 
      "Отправляйте любые сообщения - они сразу уйдут студентам\n" +
      "/count - текущее количество подключений"
    );
    return;
  }

  activeUsers.add(ctx.chat.id);
  ctx.reply("Вы в сессии! Отключение через 30 минут...\nИспользуйте /exit для выхода.");

  setTimeout(() => {
    if (activeUsers.delete(ctx.chat.id)) {
      ctx.reply("Время сессии истекло.");
      broadcastUserCount();
    }
  }, 1800000);

  broadcastUserCount();
});

bot.command("exit", (ctx) => {
  if (isTeacher(ctx)) {
    ctx.reply("Эта команда доступна только студентам.");
    return;
  }

  if (activeUsers.delete(ctx.chat.id)) {
    ctx.reply("🚪 Вы вышли из сессии.");
    broadcastUserCount();
  } else {
    ctx.reply("Вы не были подключены к сессии.");
  }
});

bot.command("count", (ctx) => {
  if (!isTeacher(ctx)) {
    ctx.reply("Эта команда доступна только преподавателю.");
    return;
  }

  ctx.reply(`Подключено студентов: ${activeUsers.size}`);
});

bot.use(async (ctx, next) => {
  if (isTeacher(ctx)) await forwardToStudents(ctx);
  else next();
});

wss.on("connection", ws => {
  ws.send(JSON.stringify({ count: activeUsers.size }));
});

function broadcastUserCount() {
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ count: activeUsers.size }));
    }
  });
}

bot.launch();
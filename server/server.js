/**
 * Отдельный фронтенд-сервер. Бэкенд (FastAPI) НЕ модифицируется и НЕ знает
 * о существовании этого сервера — тот обращается к нему как обычный
 * внешний HTTP-клиент.
 *
 * Зачем нужен прокси-слой, а не прямые fetch() из браузера в FastAPI:
 * 1. Бэкенд использует HTTP Basic Auth для /admin/api/*. Если бы React-код
 *    в браузере сам хранил и слал логин/пароль — они были бы видны в
 *    devtools/localStorage на клиенте. Здесь пароль вводится один раз при
 *    логине, дальше живёт только в серверной сессии (httpOnly-cookie),
 *    браузер его больше не видит.
 * 2. FastAPI не настроен на CORS для чужого origin (мы не трогаем бэкенд,
 *    значит не можем и не должны включать там CORS). Раз браузер обращается
 *    только к этому Node-серверу (тот же origin, что и сам React-фронт),
 *    CORS вообще не нужен.
 */
import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import { HttpsProxyAgent } from "https-proxy-agent";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const SESSION_SECRET = process.env.SESSION_SECRET;
const PORT = process.env.PORT || 3000;
const CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, "..", "client", "dist");

// Node.js, в отличие от Python/httpx, НЕ подхватывает HTTPS_PROXY
// автоматически для встроенного fetch. Внешние домены (api.telegram.org
// и т.п.) на этой сети требуют прокси — тот же самый, что уже настроен
// для git/pip/apt. Запросы к самому бэкенду (BACKEND_URL, обычно
// 127.0.0.1 или внутренний IP) идут БЕЗ прокси — незачем заворачивать
// локальный трафик через внешний прокси-сервер.
const EXTERNAL_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const externalProxyAgent = EXTERNAL_PROXY ? new HttpsProxyAgent(EXTERNAL_PROXY) : undefined;

function fetchExternal(url, options = {}) {
  return fetch(url, { ...options, agent: externalProxyAgent });
}

if (!SESSION_SECRET) {
  console.error(
    "ОШИБКА: переменная окружения SESSION_SECRET не задана. " +
      "Задайте длинную случайную строку — без неё сессии админки небезопасны."
  );
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // secure: true требует HTTPS — включите, когда он появится (см. README)
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 1000 * 60 * 60 * 8, // 8 часов
    },
  })
);

// ---------------------------------------------------------------------
// Публичный чат (без аутентификации — это конечные клиенты банка)
// ---------------------------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await backendRes.json();
    res.status(backendRes.status).json(data);
  } catch (err) {
    console.error("Ошибка проксирования /api/chat:", err.message);
    res.status(502).json({ detail: "Бэкенд недоступен: " + err.message });
  }
});

app.delete("/api/chat/session/:sessionId", async (req, res) => {
  try {
    const backendRes = await fetch(
      `${BACKEND_URL}/chat/session/${encodeURIComponent(req.params.sessionId)}`,
      { method: "DELETE" }
    );
    const data = await backendRes.json();
    res.status(backendRes.status).json(data);
  } catch (err) {
    console.error("Ошибка проксирования DELETE /api/chat/session:", err.message);
    res.status(502).json({ detail: "Бэкенд недоступен: " + err.message });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    const backendRes = await fetch(`${BACKEND_URL}/health`);
    const data = await backendRes.json();
    res.status(backendRes.status).json(data);
  } catch (err) {
    res.status(502).json({ detail: "Бэкенд недоступен: " + err.message });
  }
});

// ---------------------------------------------------------------------
// Админка — логин через сессию, дальше прокси с Basic Auth из сессии
// ---------------------------------------------------------------------

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ detail: "Укажите логин и пароль" });
  }

  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  let backendRes;
  try {
    // Пробный запрос к защищённому эндпоинту бэкенда — так проверяем
    // креды, не дублируя логику проверки пароля здесь.
    backendRes = await fetch(`${BACKEND_URL}/admin/api/kb`, {
      headers: { Authorization: authHeader },
    });
  } catch (err) {
    return res.status(502).json({ detail: "Бэкенд недоступен: " + err.message });
  }

  if (backendRes.status === 401) {
    return res.status(401).json({ detail: "Неверный логин или пароль" });
  }
  if (backendRes.status === 503) {
    return res
      .status(503)
      .json({ detail: "Админка не настроена на бэкенде (нет ADMIN_USERNAME/ADMIN_PASSWORD)" });
  }
  if (!backendRes.ok) {
    return res.status(502).json({ detail: `Бэкенд вернул неожиданный статус ${backendRes.status}` });
  }

  req.session.authHeader = authHeader;
  req.session.username = username;
  res.json({ status: "ok", username });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ status: "ok" }));
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session.authHeader) {
    return res.status(401).json({ detail: "Не авторизован" });
  }
  res.json({ username: req.session.username });
});

function requireSession(req, res, next) {
  if (!req.session.authHeader) {
    return res.status(401).json({ detail: "Не авторизован" });
  }
  next();
}

/**
 * Метрики самого этого Node-сервера + физического сервера, на котором он
 * крутится, + статус Telegram-поллинга. Отдельно от бэкендовского
 * /admin/api/monitoring (тот — про Python-процесс и его сервер).
 */
app.get("/api/monitoring-self", requireSession, async (req, res) => {
  let disk = null;
  try {
    // df -k / выводит заголовок + одну строку данных; парсим просто по
    // позициям колонок (Filesystem, 1K-blocks, Used, Available, Use%, Mounted)
    const { stdout } = await execAsync("df -k /");
    const lines = stdout.trim().split("\n");
    const cols = lines[lines.length - 1].split(/\s+/);
    const totalKb = parseInt(cols[1], 10);
    const usedKb = parseInt(cols[2], 10);
    disk = {
      total_gb: Math.round((totalKb / 1024 / 1024) * 100) / 100,
      used_gb: Math.round((usedKb / 1024 / 1024) * 100) / 100,
      percent: parseInt(cols[4], 10) || null,
    };
  } catch (err) {
    disk = { error: err.message };
  }

  let backendReachable = false;
  try {
    const backendRes = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(3000) });
    backendReachable = backendRes.ok;
  } catch {
    backendReachable = false;
  }

  res.json({
    node: {
      uptime_seconds: Math.round((Date.now() - serverStartTime) / 1000),
      pid: process.pid,
      memory_mb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      node_version: process.version,
    },
    system: {
      load_average: os.loadavg(),
      free_memory_gb: Math.round((os.freemem() / 1024 ** 3) * 100) / 100,
      total_memory_gb: Math.round((os.totalmem() / 1024 ** 3) * 100) / 100,
      disk,
    },
    backend_reachable: backendReachable,
    telegram: {
      configured: !!TELEGRAM_BOT_TOKEN,
      last_success_at: telegramLastSuccessAt,
      last_error_at: telegramLastErrorAt,
      last_error: telegramLastError,
    },
    whatsapp: {
      configured: !!(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID),
    },
  });
});

/**
 * Универсальный прокси: /api/admin/<путь> -> BACKEND_URL/admin/api/<путь>,
 * с подстановкой Basic Auth из серверной сессии. Один обработчик на все
 * методы и вложенные пути — не плодим по функции на каждый CRUD-эндпоинт.
 */
app.all(/^\/api\/admin\/(?!login|logout|me).*/, requireSession, async (req, res) => {
  const backendPath = req.originalUrl.replace(/^\/api\/admin/, "/admin/api");
  const init = {
    method: req.method,
    headers: { Authorization: req.session.authHeader },
  };
  if (!["GET", "HEAD"].includes(req.method)) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(req.body);
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}${backendPath}`, init);
    const text = await backendRes.text();
    res.status(backendRes.status);
    res.set("Content-Type", backendRes.headers.get("content-type") || "application/json");
    res.send(text);
  } catch (err) {
    console.error("Ошибка проксирования", backendPath, ":", err.message);
    res.status(502).json({ detail: "Бэкенд недоступен: " + err.message });
  }
});

// ---------------------------------------------------------------------
// WhatsApp-канал (webhook — в отличие от Telegram, здесь нет long polling,
// Meta должна сама достучаться до этого маршрута по публичному HTTPS).
// Пока не задеплоено на проде — ждём решения ИТ/безопасности банка по
// поводу публичного доступа. Код готов и протестирован логически.
// ---------------------------------------------------------------------

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_BASE = process.env.WHATSAPP_API_BASE || "https://graph.facebook.com/v21.0";

// Meta проверяет webhook именно так при настройке в консоли разработчика:
// присылает GET с hub.verify_token, ожидает получить hub.challenge обратно.
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    console.log("WhatsApp webhook верификация пройдена.");
    return res.status(200).send(challenge);
  }
  console.warn("WhatsApp webhook верификация НЕ пройдена — проверьте WHATSAPP_VERIFY_TOKEN.");
  res.sendStatus(403);
});

async function sendWhatsAppMessage(to, text) {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;
  try {
    await fetchExternal(`${WHATSAPP_API_BASE}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: text },
      }),
    });
  } catch (err) {
    console.error("Ошибка отправки сообщения в WhatsApp:", err.message, err.cause ?? "");
  }
}

app.post("/webhook/whatsapp", async (req, res) => {
  // Meta ждёт быстрый 200 OK — сначала отвечаем, обработку не блокируем ответом.
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return; // статусы доставки и т.п. — не текстовые сообщения, пропускаем

    const from = message.from; // номер телефона отправителя

    if (message.type !== "text") {
      await sendWhatsAppMessage(from, "Пока я понимаю только текстовые сообщения.");
      return;
    }

    const backendRes = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.text.body, session_id: `whatsapp-${from}` }),
    });
    const data = await backendRes.json();
    const replyText = backendRes.ok
      ? data.answer
      : "Извините, сервис временно недоступен. Попробуйте позже.";
    await sendWhatsAppMessage(from, replyText);
  } catch (err) {
    console.error("Ошибка обработки WhatsApp-сообщения:", err.message, err.cause ?? "");
  }
});

// ---------------------------------------------------------------------
// Статика собранного React-приложения
// ---------------------------------------------------------------------

app.use(express.static(CLIENT_DIST));
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Frontend server запущен на порту ${PORT}, бэкенд: ${BACKEND_URL}`);
  startTelegramPolling();
});

// ---------------------------------------------------------------------
// Telegram-канал (long polling — не требует публичного HTTPS/webhook,
// сервер сам исходящими запросами спрашивает Telegram о новых сообщениях;
// это специально выбрано вместо webhook, т.к. сервер живёт во внутренней
// сети без входящего доступа снаружи)
// ---------------------------------------------------------------------

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || "https://api.telegram.org";
const TELEGRAM_API = TELEGRAM_BOT_TOKEN ? `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}` : null;

let telegramOffset = 0;
let telegramPollingActive = false;
let telegramLastSuccessAt = null; // Date.toISOString() последнего успешного опроса
let telegramLastErrorAt = null;
let telegramLastError = null;
const serverStartTime = Date.now();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTelegramMessage(chatId, text) {
  if (!TELEGRAM_API) return;
  try {
    await fetchExternal(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("Ошибка отправки сообщения в Telegram:", err.message, err.cause ?? "");
  }
}

async function handleTelegramMessage(message) {
  const chatId = message.chat.id;

  if (message.voice) {
    return handleTelegramVoiceMessage(chatId, message.voice);
  }

  if (!message.text) {
    await sendTelegramMessage(chatId, "Пока я понимаю только текстовые и голосовые сообщения.");
    return;
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.text, session_id: `telegram-${chatId}` }),
    });
    const data = await backendRes.json();
    const replyText = backendRes.ok
      ? data.answer
      : "Извините, сервис временно недоступен. Попробуйте позже.";
    await sendTelegramMessage(chatId, replyText);
  } catch (err) {
    console.error("Ошибка обработки Telegram-сообщения:", err.message, err.cause ?? "");
    await sendTelegramMessage(chatId, "Извините, сервис временно недоступен. Попробуйте позже.");
  }
}

/**
 * Конвертирует OGG/Opus (формат голосовых сообщений Telegram) в WAV 16kHz
 * mono через ffmpeg — надёжнее, чем полагаться на то, что soundfile/librosa
 * на бэкенде умеют декодировать Opus напрямую (зависит от версии libsndfile
 * на конкретной системе, и не факт что уже установлена нужная). ffmpeg
 * поддерживает Opus стабильно и предсказуемо в любой версии.
 */
function convertOggToWav(oggBuffer) {
  return new Promise(async (resolve, reject) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inPath = path.join(os.tmpdir(), `tg-voice-${stamp}.ogg`);
    const outPath = path.join(os.tmpdir(), `tg-voice-${stamp}.wav`);

    try {
      await writeFile(inPath, oggBuffer);
    } catch (err) {
      return reject(err);
    }

    const proc = spawn("ffmpeg", ["-y", "-i", inPath, "-ar", "16000", "-ac", "1", outPath]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      // Например ENOENT, если ffmpeg не установлен в системе
      unlink(inPath).catch(() => {});
      reject(new Error(`Не удалось запустить ffmpeg: ${err.message}`));
    });
    proc.on("close", async (code) => {
      await unlink(inPath).catch(() => {});
      if (code !== 0) {
        return reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderr.slice(-500)}`));
      }
      try {
        const wavBuffer = await readFile(outPath);
        await unlink(outPath).catch(() => {});
        resolve(wavBuffer);
      } catch (err) {
        reject(err);
      }
    });
  });
}

async function handleTelegramVoiceMessage(chatId, voice) {
  try {
    // 1. getFile — узнаём путь к файлу на серверах Telegram
    const fileInfoRes = await fetchExternal(`${TELEGRAM_API}/getFile?file_id=${voice.file_id}`);
    const fileInfo = await fileInfoRes.json();
    if (!fileInfo.ok) {
      throw new Error("Telegram getFile вернул ошибку: " + JSON.stringify(fileInfo));
    }

    // 2. Скачиваем сам аудиофайл (OGG/Opus)
    const fileUrl = `${TELEGRAM_API_BASE}/file/bot${TELEGRAM_BOT_TOKEN}/${fileInfo.result.file_path}`;
    const fileRes = await fetchExternal(fileUrl);
    if (!fileRes.ok) {
      throw new Error(`Не удалось скачать файл из Telegram: HTTP ${fileRes.status}`);
    }
    const oggBuffer = Buffer.from(await fileRes.arrayBuffer());

    // 3. OGG/Opus -> WAV 16kHz mono
    const wavBuffer = await convertOggToWav(oggBuffer);

    // 4. Отправляем в уже существующий /voice/chat бэкенда как multipart —
    // бэкенд не меняется, используем то, что там уже есть для веб-виджета.
    // Используем нативный fetch/FormData/Blob (Node 18+), а не node-fetch,
    // т.к. multipart через node-fetch v3 менее предсказуем.
    const form = new FormData();
    form.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "voice.wav");
    // Тот же session_id, что и у текстовых сообщений этого чата — так
    // память диалога общая независимо от того, голосом или текстом клиент
    // писал в разные моменты разговора.
    form.append("session_id", `telegram-${chatId}`);

    const backendRes = await globalThis.fetch(`${BACKEND_URL}/voice/chat`, {
      method: "POST",
      body: form,
    });

    // Читаем как текст сначала — если бэкенд вернул не-JSON (например,
    // "Internal Server Error" при необработанном исключении, а не
    // аккуратный HTTPException), увидим тело ответа целиком в логе,
    // а не просто "не JSON" без деталей.
    const rawBody = await backendRes.text();
    let data;
    try {
      data = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `Бэкенд вернул не-JSON ответ (статус ${backendRes.status}): ${rawBody.slice(0, 300)}`
      );
    }

    if (!backendRes.ok) {
      throw new Error("Бэкенд вернул ошибку на /voice/chat: " + JSON.stringify(data));
    }

    await sendTelegramMessage(chatId, data.answer);
  } catch (err) {
    console.error("Ошибка обработки голосового сообщения Telegram:", err.message, err.cause ?? "");
    await sendTelegramMessage(
      chatId,
      "Извините, не удалось обработать голосовое сообщение. Попробуйте, пожалуйста, написать текстом."
    );
  }
}

async function startTelegramPolling() {
  if (!TELEGRAM_API) {
    console.log("TELEGRAM_BOT_TOKEN не задан — Telegram-канал выключен.");
    return;
  }

  await new Promise((resolve) => {
    const check = spawn("ffmpeg", ["-version"]);
    check.on("error", () => {
      console.warn(
        "⚠️  ffmpeg не найден в системе — голосовые сообщения Telegram обрабатываться не будут. " +
          "Установите: sudo apt install -y ffmpeg"
      );
      resolve();
    });
    check.on("close", (code) => {
      if (code === 0) console.log("ffmpeg найден — голосовые сообщения Telegram поддерживаются.");
      resolve();
    });
  });

  if (telegramPollingActive) return;
  telegramPollingActive = true;
  console.log("Telegram polling запущен.");

  while (telegramPollingActive) {
    try {
      // long polling: timeout=30 — Telegram держит соединение открытым до
      // 30 секунд, если нет новых сообщений, вместо мгновенного пустого
      // ответа. Это резко снижает частоту запросов по сравнению с обычным
      // "спроси и сразу получи пустой ответ" каждую секунду.
      const res = await fetchExternal(`${TELEGRAM_API}/getUpdates?timeout=30&offset=${telegramOffset}`);
      const data = await res.json();

      if (!data.ok) {
        console.error("Telegram getUpdates вернул ошибку:", data);
        telegramLastErrorAt = new Date().toISOString();
        telegramLastError = JSON.stringify(data);
        await sleep(5000);
        continue;
      }

      telegramLastSuccessAt = new Date().toISOString();

      for (const update of data.result) {
        telegramOffset = update.update_id + 1;
        if (update.message) {
          await handleTelegramMessage(update.message);
        }
      }
    } catch (err) {
      console.error("Ошибка Telegram polling:", err.message, err.cause ?? "");
      telegramLastErrorAt = new Date().toISOString();
      telegramLastError = err.message;
      await sleep(5000); // не долбим API при сетевых сбоях без паузы
    }
  }
}

/**
 * ============================================================
 * AMHEEX BOT — ARQUIVO ÚNICO (OTIMIZADO & BAILEYS FIXADO)
 * ============================================================
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");
const pino = require("pino");
const NodeCache = require("node-cache");
const qrcode = require("qrcode-terminal");

// Importação corrigida para versões modernas do Baileys
const baileys = require("baileys");
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidStatusBroadcast
} = baileys;

/* ============================================================
   CONFIGURAÇÃO
============================================================ */
const BOT_NAME = "🤖「 AMHEEX-BOT 」🤖";
const BOT_EMOJI = "🤖";
const BASE_DIR = path.resolve(__dirname);
const ASSETS_DIR = path.join(BASE_DIR, "assets");
const BAILEYS_DIR = path.join(ASSETS_DIR, "database", "baileys");
const TEMP_DIR = path.join(ASSETS_DIR, "temp");
const LOG_FILE = path.join(TEMP_DIR, "wa-logs.txt");

/* ============================================================
   DIRETÓRIOS DE COMANDOS
============================================================ */
const POSSIBLE_CMD_DIRS = [
  path.join(BASE_DIR, "src", "command"),
  path.join(BASE_DIR, "src", "commands")
];
const CMD_DIRS = POSSIBLE_CMD_DIRS.filter(dir => fs.existsSync(dir));
const CMD_DIR = CMD_DIRS[0] || path.join(BASE_DIR, "src", "command");

/* ============================================================
   CRIA DIRETÓRIOS
============================================================ */
for (const dir of [ASSETS_DIR, BAILEYS_DIR, TEMP_DIR, CMD_DIR]) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.error(`[${BOT_NAME}] Erro criando diretório ${dir}:`, err.message);
  }
}

/* ============================================================
   LOGGER & LOGS
============================================================ */
const logger = pino(
  {
    timestamp: () => `,"time":"${new Date().toJSON()}"`,
    level: "silent" // Alterado para evitar poluição visual de logs internos da Baileys
  },
  pino.destination(LOG_FILE)
);

function log(prefix, message) {
  console.log(`[${BOT_NAME} ${prefix}] ${message}`);
}
function info(message) { log("INFO", message); }
function success(message) { log("SUCCESS", message); }
function warning(message) { log("WARNING", message); }
function error(message) { log("ERROR", message); }

/* ============================================================
   INPUT DE PAREAMENTO
============================================================ */
let activeReadline = null;

function question(message) {
  if (activeReadline) {
    try { activeReadline.close(); } catch {}
    activeReadline = null;
  }
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  activeReadline = rl;
  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close();
      activeReadline = null;
      resolve(answer);
    });
  });
}

/* ============================================================
   AUTO RESTART
============================================================ */
const AUTO_RESTART = {
  enabled: true,
  interval: 1000,
  debounce: 1500,
  restarting: false,
  timer: null,
  snapshot: new Map(),
  watcherStarted: false
};
const RESTART_IGNORE = [
  "node_modules",
  ".git",
  path.join("assets", "database", "baileys"),
  path.join("assets", "temp")
];

function isIgnoredPath(filePath) {
  const relative = path.relative(BASE_DIR, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return true;
  }
  return RESTART_IGNORE.some(
    ignore => relative === ignore || relative.startsWith(ignore + path.sep)
  );
}

function getFileSnapshot() {
  const snapshot = new Map();
  function scan(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (isIgnoredPath(fullPath)) continue;
      if (entry.isDirectory()) {
        scan(fullPath);
        continue;
      }
      if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          snapshot.set(fullPath, `${stat.size}:${stat.mtimeMs}`);
        } catch {}
      }
    }
  }
  scan(BASE_DIR);
  return snapshot;
}

function detectSnapshotChange(previous, current) {
  for (const [filePath, signature] of current) {
    if (!previous.has(filePath) || previous.get(filePath) !== signature) {
      return {
        type: previous.has(filePath) ? "ALTERADO" : "NOVO",
        filePath
      };
    }
  }
  for (const filePath of previous.keys()) {
    if (!current.has(filePath)) {
      return { type: "REMOVIDO", filePath };
    }
  }
  return null;
}

let activeSocket = null;
let reconnectTimer = null;

function restartSystem(reason) {
  if (AUTO_RESTART.restarting) return;
  AUTO_RESTART.restarting = true;
  if (AUTO_RESTART.timer) clearTimeout(AUTO_RESTART.timer);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  info(`Auto-Restart disparado. Motivo: ${reason}`);
  try {
    if (activeSocket && typeof activeSocket.end === "function") {
      activeSocket.end(new Error("AMHEEX_AUTO_RESTART"));
    }
  } catch (err) {
    warning(`Erro fechando socket no restart: ${err.message}`);
  }
  try {
    const child = spawn(process.execPath, process.argv.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });
    child.once("error", err => {
      error(`Falha ao sub-processar restart: ${err.message}`);
      AUTO_RESTART.restarting = false;
    });
    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    error(`Erro ao executar restart: ${err.message}`);
    AUTO_RESTART.restarting = false;
  }
}

function startBaseDirWatcher() {
  if (!AUTO_RESTART.enabled || AUTO_RESTART.watcherStarted) return;
  AUTO_RESTART.watcherStarted = true;
  info("Watcher do diretório ativo.");
  AUTO_RESTART.snapshot = getFileSnapshot();
  setInterval(() => {
    if (AUTO_RESTART.restarting) return;
    const current = getFileSnapshot();
    const change = detectSnapshotChange(AUTO_RESTART.snapshot, current);
    AUTO_RESTART.snapshot = current;
    if (!change) return;
    const relativePath = path.relative(BASE_DIR, change.filePath);
    clearTimeout(AUTO_RESTART.timer);
    AUTO_RESTART.timer = setTimeout(() => {
      restartSystem(`${change.type}: ${relativePath}`);
    }, AUTO_RESTART.debounce);
  }, AUTO_RESTART.interval);
}

/* ============================================================
   CACHE & CONTROLE DE MENSAGENS
============================================================ */
const msgRetryCounterCache = new NodeCache();
const groupCache = new NodeCache({ stdTTL: 86400, checkperiod: 60 });
const outgoingIds = new Set();
const MAX_OUTGOING_IDS = 2000;

function markOutgoing(result) {
  const id = result?.key?.id;
  if (!id) return result;
  outgoingIds.add(id);
  if (outgoingIds.size > MAX_OUTGOING_IDS) {
    const first = outgoingIds.values().next().value;
    if (first) outgoingIds.delete(first);
  }
  return result;
}

/* ============================================================
   EXTRAÇÃO E TRATAMENTO DE MENSAGENS
============================================================ */
function unwrapMessage(message) {
  let current = message || {};
  for (let i = 0; i < 20; i++) {
    if (current.ephemeralMessage?.message) { current = current.ephemeralMessage.message; continue; }
    if (current.viewOnceMessage?.message) { current = current.viewOnceMessage.message; continue; }
    if (current.viewOnceMessageV2?.message) { current = current.viewOnceMessageV2.message; continue; }
    if (current.viewOnceMessageV2Extension?.message) { current = current.viewOnceMessageV2Extension.message; continue; }
    if (current.documentWithCaptionMessage?.message) { current = current.documentWithCaptionMessage.message; continue; }
    if (current.editedMessage?.message) { current = current.editedMessage.message; continue; }
    if (current.protocolMessage?.editedMessage) { current = current.protocolMessage.editedMessage; continue; }
    break;
  }
  return current;
}

function getMessageType(webMessage) {
  const message = unwrapMessage(webMessage?.message);
  if (!message) return "unknown";
  return Object.keys(message)[0] || "unknown";
}

function getContextInfo(message) {
  return (
    message?.contextInfo ||
    message?.extendedTextMessage?.contextInfo ||
    message?.imageMessage?.contextInfo ||
    message?.videoMessage?.contextInfo ||
    message?.documentMessage?.contextInfo ||
    message?.audioMessage?.contextInfo ||
    message?.stickerMessage?.contextInfo ||
    message?.buttonsResponseMessage?.contextInfo ||
    message?.templateButtonReplyMessage?.contextInfo ||
    message?.listResponseMessage?.contextInfo ||
    message?.interactiveResponseMessage?.contextInfo ||
    message?.nativeFlowResponseMessage?.contextInfo ||
    message?.reactionMessage?.key?.contextInfo ||
    null
  );
}

function extractMessageDetails(webMessage) {
  const original = webMessage?.message || {};
  const message = unwrapMessage(original);
  const key = webMessage?.key || {};
  if (!message) {
    return {
      type: "unknown", text: "", buttonId: "", buttonText: "",
      listId: "", listTitle: "", data: {}, raw: {}, original,
      contextInfo: null, key
    };
  }
  let type = getMessageType(webMessage);
  let text = "";
  let buttonId = "";
  let buttonText = "";
  let listId = "";
  let listTitle = "";
  let data = {};
  if (message.conversation) {
    type = "text";
    text = message.conversation;
    data = { text: message.conversation };
  } else if (message.extendedTextMessage) {
    type = "extended_text";
    text = message.extendedTextMessage.text || "";
    data = { ...message.extendedTextMessage };
  } else if (message.imageMessage) {
    type = "image";
    text = message.imageMessage.caption || "";
    data = { ...message.imageMessage };
  } else if (message.videoMessage) {
    type = "video";
    text = message.videoMessage.caption || "";
    data = { ...message.videoMessage };
  } else if (message.documentMessage) {
    type = "document";
    text = message.documentMessage.caption || message.documentMessage.fileName || "";
    data = { ...message.documentMessage };
  } else if (message.audioMessage) {
    type = "audio";
    data = { ...message.audioMessage };
  } else if (message.stickerMessage) {
    type = "sticker";
    data = { ...message.stickerMessage };
  } else if (message.reactionMessage) {
    type = "reaction";
    text = message.reactionMessage.text || "";
    data = { ...message.reactionMessage };
  } else if (message.buttonsResponseMessage) {
    type = "button_reply";
    const item = message.buttonsResponseMessage;
    buttonId = item.selectedButtonId || item.id || "";
    buttonText = item.selectedDisplayText || item.displayText || item.text || "";
    text = buttonText || buttonId;
    data = { ...item };
  } else if (message.templateButtonReplyMessage) {
    type = "template_button_reply";
    const item = message.templateButtonReplyMessage;
    buttonId = item.selectedId || item.selectedButtonId || item.id || "";
    buttonText = item.selectedDisplayText || item.displayText || item.text || "";
    text = buttonText || buttonId;
    data = { ...item };
  } else if (message.listResponseMessage) {
    type = "list_reply";
    const item = message.listResponseMessage;
    const selected = item.singleSelectReply || {};
    listId = selected.selectedRowId || item.selectedRowId || "";
    listTitle = item.title || item.description || "";
    text = selected.title || selected.description || listTitle || listId;
    data = { ...item };
  } else if (message.interactiveResponseMessage || message.nativeFlowResponseMessage) {
    type = message.interactiveResponseMessage ? "interactive_reply" : "native_flow_reply";
    const item = message.interactiveResponseMessage || message.nativeFlowResponseMessage;
    const native = item.nativeFlowResponseMessage || item;
    const paramsJson = native.paramsJson || item.paramsJson || "";
    let params = {};
    try { params = JSON.parse(paramsJson); } catch { params = { rawParamsJson: paramsJson }; }
    buttonId = params.id || params.selectedId || params.selected_id || params.button_id || params.selectedRowId || "";
    buttonText = params.display_text || params.selected_display_text || params.button_text || params.text || "";
    listId = params.selectedRowId || params.selected_id || params.id || "";
    text = buttonText || buttonId || params.text || "";
    data = { ...item, params };
  } else if (message.locationMessage) {
    type = "location";
    text = message.locationMessage.name || message.locationMessage.address || "";
    data = { ...message.locationMessage };
  } else if (message.contactMessage) {
    type = "contact";
    text = message.contactMessage.displayName || "";
    data = { ...message.contactMessage };
  } else if (message.pollCreationMessage) {
    type = "poll_creation";
    text = message.pollCreationMessage.name || "";
    data = { ...message.pollCreationMessage };
  } else {
    type = getMessageType(webMessage);
    data = { ...message };
  }
  return {
    type,
    text: String(text || "").trim(),
    buttonId: String(buttonId || "").trim(),
    buttonText: String(buttonText || "").trim(),
    listId: String(listId || "").trim(),
    listTitle: String(listTitle || "").trim(),
    data,
    raw: message,
    original,
    contextInfo: getContextInfo(message),
    key,
    webMessage
  };
}

function extractQuotedDetails(webMessage) {
  const message = unwrapMessage(webMessage?.message);
  const contextInfo = getContextInfo(message);
  if (!contextInfo?.quotedMessage) return null;
  const quotedWebMessage = {
    key: {
      remoteJid: contextInfo.remoteJid || webMessage?.key?.remoteJid || null,
      participant: contextInfo.participant || "",
      id: contextInfo.stanzaId || "",
      fromMe: false
    },
    message: contextInfo.quotedMessage,
    pushName: ""
  };
  return extractMessageDetails(quotedWebMessage);
}

function getRemoteJid(webMessage) {
  return webMessage?.key?.remoteJid || null;
}

function getChatType(remoteJid) {
  if (!remoteJid) return "DESCONHECIDO";
  if (remoteJid.endsWith("@g.us")) return "GRUPO";
  if (remoteJid.endsWith("@newsletter")) return "CANAL";
  if (remoteJid.endsWith("@broadcast")) return "TRANSMISSÃO";
  if (remoteJid.endsWith("@s.whatsapp.net")) return "PRIVADO";
  return "OUTRO";
}

/* ============================================================
   GERENCIAMENTO DE COMANDOS
============================================================ */
const commands = new Map();
let fallbackHandler = null;

function normalizeCommandName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[!/#.$%]+/, "")
    .split(/\s+/)[0];
}

function readCommandsFromDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  let items;
  try {
    items = fs.readdirSync(dirPath);
  } catch (err) {
    error(`Erro ao ler comandos em ${dirPath}: ${err.message}`);
    return;
  }
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    let stat;
    try { stat = fs.statSync(fullPath); } catch { continue; }
    if (stat.isDirectory()) {
      readCommandsFromDir(fullPath);
      continue;
    }
    if (!item.endsWith(".js")) continue;
    try {
      delete require.cache[require.resolve(fullPath)];
      const mod = require(fullPath);
      const baseName = path.basename(item, ".js").toLowerCase();
      const commandNames = new Set([baseName]);
      if (mod && typeof mod === "object") {
        if (mod.name) commandNames.add(String(mod.name).toLowerCase());
        if (Array.isArray(mod.commands)) mod.commands.forEach(c => commandNames.add(String(c).toLowerCase()));
        if (Array.isArray(mod.aliases)) mod.aliases.forEach(a => commandNames.add(String(a).toLowerCase()));
        if (mod.isAI || mod.isFallback || (typeof mod.handle === "function" && baseName === "ai")) {
          fallbackHandler = mod;
        }
      } else if (typeof mod === "function" && baseName === "ai") {
        fallbackHandler = mod;
      }
      for (const name of commandNames) {
        const normalized = normalizeCommandName(name);
        if (normalized && !commands.has(normalized)) {
          commands.set(normalized, mod);
        }
      }
      info(`Carregado: ${path.relative(BASE_DIR, fullPath)}`);
    } catch (err) {
      error(`Falha ao carregar ${item}: ${err.stack || err.message}`);
    }
  }
}

function loadCommands() {
  commands.clear();
  fallbackHandler = null;
  const targetDirs = CMD_DIRS.length ? CMD_DIRS : [CMD_DIR];
  for (const dir of targetDirs) readCommandsFromDir(dir);
  info(`Total de comandos mapeados: ${commands.size}`);
}

function findCommand(text) {
  const clean = String(text || "").trim();
  const firstWord = normalizeCommandName(clean);
  if (!firstWord) return null;
  const command = commands.get(firstWord);
  if (!command) return null;
  return { name: firstWord, command };
}

/* ============================================================
   FUNÇÕES DE ENVIO
============================================================ */
async function sendText(socket, jid, text, quoted) {
  if (!text) return null;
  const result = await socket.sendMessage(
    jid,
    { text: `${BOT_EMOJI} ${text}` },
    quoted ? { quoted } : undefined
  );
  return markOutgoing(result);
}

async function sendAudio(socket, jid, audio, quoted) {
  if (!audio) return null;
  const result = await socket.sendMessage(
    jid,
    { audio: { url: audio }, mimetype: "audio/ogg; codecs=opus", ptt: false },
    quoted ? { quoted } : undefined
  );
  return markOutgoing(result);
}

/* ============================================================
   CONTEXTO TOTAL PARA OS COMANDOS
============================================================ */
function createCommandContext(socket, webMessage, text, commandName) {
  const jid = getRemoteJid(webMessage);
  const key = webMessage?.key || {};
  const details = extractMessageDetails(webMessage);
  const quotedDetails = extractQuotedDetails(webMessage);
  const contextInfo = details.contextInfo;
  const quotedText = (
    quotedDetails?.text ||
    quotedDetails?.buttonText ||
    quotedDetails?.buttonId ||
    quotedDetails?.listId ||
    ""
  ).trim();
  const args = String(text || "").trim().split(/\s+/).slice(1);
  const chatType = getChatType(jid);
  const senderJid = key.participant || key.remoteJid || "";
  const senderNumber = String(senderJid).replace(/[^0-9]/g, "");
  return {
    socket, sock: socket, client: socket, conn: socket, baileys: socket,
    message: webMessage, msg: webMessage, webMessage, m: webMessage,
    rawMessage: details.raw, raw: details.raw, originalMessage: details.original,
    details, messageDetails: details, data: details.data, received: details,
    key, messageKey: key, messageId: key.id || "",
    remoteJid: jid, jid, from: jid, chat: jid,
    participant: key.participant || "", senderJid, sender: senderJid, senderNumber,
    pushName: webMessage?.pushName || "", fromMe: !!key.fromMe,
    chatType,
    isGroup: jid?.endsWith("@g.us") || false,
    isPrivate: jid?.endsWith("@s.whatsapp.net") || false,
    isChannel: jid?.endsWith("@newsletter") || false,
    text, args, quotedText,
    command: commandName, commandName,
    type: details.type, messageType: details.type,
    buttonId: details.buttonId, buttonText: details.buttonText,
    button: { id: details.buttonId, text: details.buttonText, type: details.type, data: details.data },
    listId: details.listId, listTitle: details.listTitle,
    list: { id: details.listId, title: details.listTitle, data: details.data },
    interactive: details.type === "interactive_reply" ? details.data : null,
    nativeFlow: details.type === "native_flow_reply" ? details.data : null,
    contextInfo,
    mentionedJid: contextInfo?.mentionedJid || [],
    groupMentions: contextInfo?.groupMentions || [],
    stanzaId: contextInfo?.stanzaId || "",
    participantQuoted: contextInfo?.participant || "",
    quotedMessage: contextInfo?.quotedMessage || null,
    quotedDetails, quoted: quotedDetails,
    send: (content, options) => socket.sendMessage(jid, content, options),
    sendText: (value, quoted = webMessage) => sendText(socket, jid, value, quoted),
    sendReply: value => sendText(socket, jid, value, webMessage),
    reply: value => sendText(socket, jid, value, webMessage),
    sendAudio: (audio, quoted = webMessage) => sendAudio(socket, jid, audio, quoted),
    getMessageDetails: () => extractMessageDetails(webMessage),
    getQuotedDetails: () => extractQuotedDetails(webMessage),
    getContextInfo: () => getContextInfo(details.raw),
    getChatType: () => chatType,
    baseDir: BASE_DIR, assetsDir: ASSETS_DIR, cmdDir: CMD_DIR,
    log: (...a) => console.log(`[${BOT_NAME} CMD:${commandName}]`, ...a),
    info: (...a) => console.log(`[${BOT_NAME} CMD:${commandName}]`, ...a),
    warning: (...a) => console.warn(`[${BOT_NAME} CMD:${commandName}]`, ...a),
    error: (...a) => console.error(`[${BOT_NAME} CMD:${commandName}]`, ...a)
  };
}

/* ============================================================
   EXECUÇÃO DE COMANDOS & FALLBACK
============================================================ */
async function executeCommand(socket, webMessage, text) {
  const found = findCommand(text);
  if (!found || !found.command) return false;
  const commandName = found.name;
  const mod = found.command;
  const context = createCommandContext(socket, webMessage, text, commandName);
  info(`Executando: ${commandName} por ${context.senderNumber || "desconhecido"}`);
  try {
    if (typeof mod === "function") {
      try {
        await mod(context);
      } catch (firstError) {
        warning(`Assinatura moderna falhou em '${commandName}'. Tentando formato legado.`);
        await mod(socket, webMessage, context.args, { text, commandName, context, details: context.details });
      }
    } else if (mod && typeof mod.execute === "function") {
      await mod.execute(context);
    } else if (mod && typeof mod.run === "function") {
      await mod.run(context);
    } else if (mod && typeof mod.handle === "function") {
      await mod.handle(context);
    } else {
      warning(`Comando '${commandName}' não contém método executável válido.`);
      return false;
    }
    success(`Concluído: ${commandName}`);
    return true;
  } catch (err) {
    error(`Erro ao executar '${commandName}': ${err?.stack || err?.message || err}`);
    try {
      await sendText(socket, context.jid, "Ocorreu um erro ao processar este comando.", webMessage);
    } catch {}
    return true;
  }
}

async function executeFallback(socket, webMessage, text) {
  if (!fallbackHandler) return false;
  const context = createCommandContext(socket, webMessage, text, "AMHEEX_FALLBACK");
  context.isAI = true;
  try {
    if (typeof fallbackHandler.handle === "function") {
      await fallbackHandler.handle(context);
      return true;
    }
    if (typeof fallbackHandler.execute === "function") {
      await fallbackHandler.execute(context);
      return true;
    }
    if (typeof fallbackHandler === "function") {
      await fallbackHandler(context);
      return true;
    }
  } catch (err) {
    error(`Erro no Fallback/IA: ${err?.stack || err?.message || err}`);
  }
  return false;
}

/* ============================================================
   PROCESSAMENTO DE MENSAGENS
============================================================ */
async function processMessage(socket, webMessage) {
  const key = webMessage?.key || {};
  const remoteJid = key.remoteJid;
  if (!remoteJid || !webMessage?.message) return;
  const ownMessage = !!key.fromMe;
  const details = extractMessageDetails(webMessage);
  const text = details.text;
  const sender = key.participant || remoteJid;
  info(`[${getChatType(remoteJid)}] Mensagem de ${sender} | Tipo: ${details.type}`);
  if (ownMessage) {
    if (outgoingIds.has(key?.id)) return;
    info("Comando manual disparado pela própria conta.");
  }
  if (!text) return;
  const commandExecuted = await executeCommand(socket, webMessage, text);
  if (commandExecuted) return;
  await executeFallback(socket, webMessage, text);
}

/* ============================================================
   CONEXÃO COM A BAILEYS
============================================================ */
async function connect() {
  if (AUTO_RESTART.restarting) return null;
  if (activeSocket) {
    warning("Instância de conexão já ativa.");
    return activeSocket;
  }
  
  const { state, saveCreds } = await useMultiFileAuthState(BAILEYS_DIR);
  
  // Tratamento de versão otimizado
  let version = [2, 3000, 1015901307];
  try {
    const fetchedVersion = await fetchLatestBaileysVersion();
    if (fetchedVersion && fetchedVersion.version) {
      version = fetchedVersion.version;
    }
  } catch (e) {
    warning("Não foi possível buscar a última versão da Baileys, usando fallback interno.");
  }

  const socket = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    defaultQueryTimeoutMs: undefined,
    retryRequestDelayMs: 5000,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    shouldIgnoreJid: jid => isJidBroadcast(jid) || isJidStatusBroadcast(jid),
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
    maxMsgRetryCount: 5,
    markOnlineOnConnect: true,
    syncFullHistory: false,
    emitOwnEvents: true,
    msgRetryCounterCache,
    shouldSyncHistoryMessage: () => false,
    cachedGroupMetadata: jid => groupCache.get(jid)
  });
  activeSocket = socket;

  let promptTimer = null;

  socket.ev.on("connection.update", async update => {
    const { connection, qr, lastDisconnect } = update;
    
    if (qr && !state.creds.registered && !AUTO_RESTART.restarting) {
      info("QR Code gerado (escaneie no aplicativo):");
      qrcode.generate(qr, { small: true });

      if (promptTimer) clearTimeout(promptTimer);

      promptTimer = setTimeout(async () => {
        if (AUTO_RESTART.restarting || state.creds.registered) return;
        try {
          const phoneNumber = await question("\nDigite o número com DDI (ex: 5511999999999) ou ENTER para QR Code: ");
          if (AUTO_RESTART.restarting) return;
          const cleanNumber = String(phoneNumber || "").replace(/[^0-9]/g, "");
          if (cleanNumber) {
            info("Solicitando código de pareamento...");
            // Ajustado para sintaxe padrão Baileys
            const code = await socket.requestPairingCode(cleanNumber);
            console.log("\n=================================");
            success(`CÓDIGO DE PAREAMENTO: ${code}`);
            console.log("=================================\n");
          } else {
            info("Continuando com a leitura do QR Code...");
          }
        } catch (err) {
          if (!AUTO_RESTART.restarting) {
            error(`Erro no pareamento: ${err?.message || err}`);
          }
        }
      }, 500);
    }

    if (connection === "open") {
      if (promptTimer) clearTimeout(promptTimer);
      if (activeReadline) {
        try { activeReadline.close(); } catch {}
        activeReadline = null;
      }
      success("Conectado ao WhatsApp com sucesso!");
    }

    if (connection === "close") {
      if (promptTimer) clearTimeout(promptTimer);
      if (activeReadline) {
        try { activeReadline.close(); } catch {}
        activeReadline = null;
      }
      if (AUTO_RESTART.restarting) return;
      if (activeSocket === socket) activeSocket = null;
      
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      warning(`Conexão fechada. Código: ${statusCode || "Desconhecido"}`);
      if (!shouldReconnect) {
        error("Sessão encerrada (loggedOut). Remova a pasta de credenciais e escaneie o QR Code novamente.");
        return;
      }
      
      warning("Reconectando em 10 segundos...");
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        if (AUTO_RESTART.restarting) return;
        try {
          await connect();
        } catch (err) {
          error(`Erro ao reconectar: ${err?.message || err}`);
        }
      }, 10000);
    }
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("messages.upsert", async data => {
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    if (!messages.length) return;
    for (const webMessage of messages) {
      try {
        await processMessage(socket, webMessage);
      } catch (err) {
        error(`Erro no processamento da mensagem: ${err?.stack || err?.message || err}`);
      }
    }
  });

  return socket;
}

/* ============================================================
   INICIALIZAÇÃO & TRATAMENTO DE ERROS GLOBAIS
============================================================ */
async function start() {
  console.clear();
  console.log("\n🤖「 ============================================================ 」🤖\n");
  console.log("                         🤖「 AMHEEX BOT 」🤖");
  console.log("\n🤖「 ============================================================ 」🤖\n");
  info(`BASE_DIR: ${BASE_DIR}`);
  info(`Diretório de Comandos: ${CMD_DIR}`);
  loadCommands();
  startBaseDirWatcher();
  info("Iniciando socket do WhatsApp...");
  await connect();
}

process.on("uncaughtException", err => {
  error(`UNCAUGHT EXCEPTION: ${err?.stack || err?.message || err}`);
});
process.on("unhandledRejection", reason => {
  error(`UNHANDLED REJECTION: ${reason?.stack || reason?.message || reason}`);
});

start().catch(err => {
  error(`Erro fatal na inicialização: ${err?.stack || err?.message || err}`);
  process.exit(1);
});

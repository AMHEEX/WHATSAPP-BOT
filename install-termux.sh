#!/bin/bash

# ==========================================
# CONFIGURAÇÕES E VARIÁVEIS
# ==========================================
BOT_DIR="/sdcard/WHATSAPP-BOT"
BOT_REPO="https://github.com/AMX-OFC/WHATSAPP-BOT.git"
MODULES_REPO="https://github.com/AMX-OFC/node_modules.git"

# Solicitando permissão de acesso ao armazenamento do Android caso não tenha
if [ ! -d "/sdcard" ]; then
    echo "Solicitando permissão de armazenamento..."
    termux-setup-storage
    sleep 3
fi

# ==========================================
# 1. ATUALIZAÇÃO DO SISTEMA E NODE.JS
# ==========================================
echo "[1/4] Instalando dependências do sistema no Termux..."
pkg update -y && pkg upgrade -y
pkg install -y git nodejs

# ==========================================
# 2. DIRETÓRIO E ARQUIVOS DO BOT
# ==========================================
echo "[2/4] Configurando arquivos do bot..."
mkdir -p "$BOT_DIR"
cd "$BOT_DIR" || exit 1

clonar_bot() {
    echo "Baixando arquivos do bot..."
    # Limpa o diretório atual mantendo a estrutura
    rm -rf ./* ./.* 2>/dev/null
    git clone "$BOT_REPO" .
}

if [ -f "package.json" ] || [ -f "index.js" ]; then
    read -p "Os arquivos do BOT já existem. Deseja reinstalar? (s/n): " resp_bot
    case "$resp_bot" in
        [sS]|[sS][iI][mM])
            clonar_bot
            ;;
        *)
            echo "Mantendo arquivos atuais do bot."
            ;;
    esac
else
    clonar_bot
fi

# ==========================================
# 3. PASTA NODE_MODULES
# ==========================================
echo "[3/4] Configurando dependências (node_modules)..."

clonar_modules() {
    echo "Baixando pasta node_modules..."
    rm -rf node_modules
    git clone "$MODULES_REPO" node_modules
}

if [ -d "node_modules" ]; then
    read -p "A pasta node_modules já existe. Deseja reinstalar? (s/n): " resp_mod
    case "$resp_mod" in
        [sS]|[sS][iI][mM])
            clonar_modules
            ;;
        *)
            echo "Mantendo pasta node_modules existente."
            ;;
    esac
else
    clonar_modules
fi

# ==========================================
# 4. INICIALIZAÇÃO
# ==========================================
echo "[4/4] Iniciando o bot..."
if [ -f "package.json" ]; then
    npm start
else
    echo "Erro: package.json não foi encontrado em $BOT_DIR"
    exit 1
fi

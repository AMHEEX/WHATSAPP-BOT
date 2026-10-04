#!/bin/bash

# ==========================================
# CONFIGURAÇÕES E VARIÁVEIS
# ==========================================
BOT_REPO="https://github.com/AMX-OFC/WHATSAPP-BOT.git"
MODULES_REPO="https://github.com/AMX-OFC/node_modules.git"

# Detecta automaticamente o ambiente (Termux vs VPS/Sandbox)
if [ -d "$PREFIX" ] || command -v termux-setup-storage &> /dev/null; then
    # Ambiente Termux
    BOT_DIR="$HOME"
    IS_TERMUX=true
else
    # Ambiente VPS / Sandbox / Linux padrão
    BOT_DIR="$(pwd)"
    IS_TERMUX=false
fi

# Cores para estilização
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
NC='\033[1;m' # Sem cor

# Limpa a tela para uma melhor experiência visual
clear

echo -e "${CYAN}====================================================${NC}"
echo -e "${GREEN}          INSTALADOR E GERENCIADOR DO BOT           ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "${YELLOW} Ambiente detectado: ${BLUE}$([ "$IS_TERMUX" = true ] && echo "Termux (Android)" || echo "VPS / Sandbox (Linux)")"
echo -e "${YELLOW} Diretório base:     ${BLUE}$BOT_DIR${NC}"
echo -e "${CYAN}====================================================${NC}\n"

# ==========================================
# PERGUNTAS INICIAIS DE CONTROLE
# ==========================================
echo -e "${YELLOW}[?] Deseja reinstalar o sistema do bot (código fonte)?${NC}"
read -p "Digite (s/n): " resp_sistema

echo -e "\n${YELLOW}[?] Deseja baixar/reinstalar a pasta node_modules?${NC}"
read -p "Digite (s/n): " resp_modules

echo -e "\n${CYAN}----------------------------------------------------${NC}"
echo -e "${GREEN} Iniciando o processo de configuração...${NC}"
echo -e "${CYAN}----------------------------------------------------${NC}\n"

# Apenas executa configuração de armazenamento se for Termux
if [ "$IS_TERMUX" = true ]; then
    if [ ! -d "/storage/shared/WHATSAPP-BOT" ]; then
        echo -e "${YELLOW}Solicitando permissão de armazenamento do Android...${NC}"
        termux-setup-storage
        sleep 3
    fi
fi

# ==========================================
# 1. VERIFICAÇÃO E INSTALAÇÃO DE DEPENDÊNCIAS
# ==========================================
echo -e "${BLUE}[1/4] Verificando dependências do sistema (Git e Node.js)...${NC}"

if [ "$IS_TERMUX" = true ]; then
    pkg update -y && pkg upgrade -y
    pkg install -y git nodejs
else
    if ! command -v git &> /dev/null || ! command -v node &> /dev/null; then
        echo -e "${YELLOW}Instalando dependências via gerenciador de pacotes do sistema...${NC}"
        if command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git nodejs
        elif command -v yum &> /dev/null; then
            sudo yum install -y git nodejs
        fi
    fi
fi

# ==========================================
# 2. DIRETÓRIO E ARQUIVOS DO BOT
# ==========================================
echo -e "\n${BLUE}[2/4] Configurando arquivos do bot...${NC}"
mkdir -p "$BOT_DIR"
cd "$BOT_DIR" || exit 1

clonar_bot() {
    echo -e "${GREEN}Baixando arquivos atualizados do bot...${NC}"
    rm -rf ./* ./.* 2>/dev/null
    git clone "$BOT_REPO" .
}

case "$resp_sistema" in
    [sS]|[sS][iI][mM])
        clonar_bot
        ;;
    *)
        if [ -f "package.json" ]; then
            echo -e "${YELLOW}Ignorando reinstalação do sistema. Usando arquivos locais.${NC}"
        else
            echo -e "${RED}Nenhum código encontrado. Baixando bot por segurança...${NC}"
            clonar_bot
        fi
        ;;
esac

# ==========================================
# 3. PASTA NODE_MODULES
# ==========================================
echo -e "\n${BLUE}[3/4] Configurando dependências (node_modules)...${NC}"

clonar_modules() {
    echo -e "${GREEN}Baixando pasta node_modules...${NC}"
    rm -rf node_modules
    git clone "$MODULES_REPO" node_modules
}

case "$resp_modules" in
    [sS]|[sS][iI][mM])
        clonar_modules
        ;;
    *)
        if [ -d "node_modules" ]; then
            echo -e "${YELLOW}Mantendo a pasta node_modules existente.${NC}"
        else
            echo -e "${RED}Aviso: node_modules não existe. Baixando por segurança...${NC}"
            clonar_modules
        fi
        ;;
esac

# ==========================================
# 4. INICIALIZAÇÃO
# ==========================================
echo -e "\n${CYAN}====================================================${NC}"
echo -e "${GREEN}[4/4] Inicializando o bot...${NC}"
echo -e "${CYAN}====================================================${NC}"

if [ -f "package.json" ]; then
    npm start
else
    echo -e "${RED}Erro: package.json não foi encontrado em $BOT_DIR${NC}"
    exit 1
fi

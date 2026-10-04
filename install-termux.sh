#!/bin/bash

# ==========================================
# CONFIGURAÇÕES
# ==========================================
BOT_REPO="https://github.com/AMX-OFC/WHATSAPP-BOT.git"
MODULES_REPO="https://github.com/AMX-OFC/node_modules.git"

# SOMENTE ESTA PASTA SERÁ MOVIDA PARA /sdcard
PASTA_ESPECIFICA="WHATSAPP-BOT"

# Diretório temporário do download
BOT_TEMP="$HOME/.whatsapp-bot-temp"

# ==========================================
# DETECTAR TERMUX
# ==========================================
if [ -n "$PREFIX" ] && command -v termux-setup-storage >/dev/null 2>&1; then
    BOT_DIR="$HOME"
    IS_TERMUX=true
else
    BOT_DIR="$(pwd)"
    IS_TERMUX=false
fi

# ==========================================
# CORES
# ==========================================
RED='\033[1;31m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
NC='\033[0m'

clear

echo -e "${CYAN}====================================================${NC}"
echo -e "${GREEN}          INSTALADOR E GERENCIADOR DO BOT           ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo -e "${YELLOW}Ambiente:${NC} $([ "$IS_TERMUX" = true ] && echo "Termux (Android)" || echo "Linux / VPS")"
echo -e "${YELLOW}Diretório base:${NC} $BOT_DIR"
echo -e "${YELLOW}Pasta específica:${NC} $PASTA_ESPECIFICA"
echo -e "${CYAN}====================================================${NC}"
echo

# ==========================================
# PERGUNTAS
# ==========================================
echo -e "${YELLOW}[?] Deseja atualizar/instalar o sistema do bot?${NC}"
read -r -p "Digite (s/n): " resp_sistema

echo
echo -e "${YELLOW}[?] Deseja baixar/reinstalar a pasta node_modules?${NC}"
read -r -p "Digite (s/n): " resp_modules

echo
echo -e "${CYAN}----------------------------------------------------${NC}"
echo -e "${GREEN}Iniciando instalação...${NC}"
echo -e "${CYAN}----------------------------------------------------${NC}"
echo

# ==========================================
# PERMISSÃO DO TERMUX
# ==========================================
if [ "$IS_TERMUX" = true ]; then

    STORAGE_DIR="$HOME/storage/shared"

    if [ ! -d "$STORAGE_DIR" ]; then

        echo -e "${YELLOW}Solicitando permissão de armazenamento...${NC}"
        sleep 2

        termux-setup-storage

        echo -e "${YELLOW}Aguardando permissão...${NC}"

        for i in {1..20}; do

            if [ -d "$STORAGE_DIR" ]; then
                echo -e "${GREEN}Permissão concedida!${NC}"
                break
            fi

            sleep 1
        done

        if [ ! -d "$STORAGE_DIR" ]; then
            echo -e "${RED}ERRO: permissão de armazenamento não concedida.${NC}"
            exit 1
        fi

    else
        echo -e "${GREEN}Permissão de armazenamento já configurada.${NC}"
    fi

    if [ ! -d "/sdcard" ]; then
        echo -e "${RED}ERRO: /sdcard não está disponível.${NC}"
        exit 1
    fi

fi

# ==========================================
# 1. DEPENDÊNCIAS
# ==========================================
echo
echo -e "${BLUE}[1/4] Verificando Git e Node.js...${NC}"

if [ "$IS_TERMUX" = true ]; then

    pkg update -y
    pkg install -y git nodejs

else

    if ! command -v git >/dev/null 2>&1 ||
       ! command -v node >/dev/null 2>&1; then

        echo -e "${YELLOW}Instalando dependências...${NC}"

        if command -v apt-get >/dev/null 2>&1; then

            if command -v sudo >/dev/null 2>&1; then
                sudo apt-get update
                sudo apt-get install -y git nodejs
            else
                apt-get update
                apt-get install -y git nodejs
            fi

        elif command -v yum >/dev/null 2>&1; then

            if command -v sudo >/dev/null 2>&1; then
                sudo yum install -y git nodejs
            else
                yum install -y git nodejs
            fi

        else
            echo -e "${RED}Gerenciador de pacotes não encontrado.${NC}"
            exit 1
        fi
    fi

fi

# ==========================================
# 2. SISTEMA DO BOT
# ==========================================
echo
echo -e "${BLUE}[2/4] Configurando sistema do bot...${NC}"

mkdir -p "$BOT_DIR"

atualizar_bot() {

    echo -e "${GREEN}Baixando sistema do bot...${NC}"

    rm -rf "$BOT_TEMP"

    if ! git clone "$BOT_REPO" "$BOT_TEMP"; then
        echo -e "${RED}Falha ao baixar o sistema do bot.${NC}"
        rm -rf "$BOT_TEMP"
        exit 1
    fi

    # Remove Git
    rm -rf "$BOT_TEMP/.git"

    PASTA_ORIGEM="$BOT_TEMP/$PASTA_ESPECIFICA"

    # ==========================================
    # INSTALAR SISTEMA DIRETAMENTE NO BOT_DIR
    #
    # EXCEÇÕES:
    # - storage
    # - node_modules
    # - WHATSAPP-BOT
    # ==========================================
    echo -e "${GREEN}Instalando sistema diretamente em:${NC}"
    echo -e "${BLUE}$BOT_DIR${NC}"

    if command -v rsync >/dev/null 2>&1; then

        rsync -a \
            --exclude="storage" \
            --exclude="node_modules" \
            --exclude="$PASTA_ESPECIFICA" \
            "$BOT_TEMP/" \
            "$BOT_DIR/"

    else

        find "$BOT_TEMP" \
            -mindepth 1 \
            -maxdepth 1 \
            ! -name ".git" \
            ! -name "storage" \
            ! -name "node_modules" \
            ! -name "$PASTA_ESPECIFICA" \
            -exec cp -rn {} "$BOT_DIR/" \;

    fi

    echo -e "${GREEN}Sistema instalado diretamente no BOT_DIR.${NC}"

    # ==========================================
    # MOVER A PASTA ESPECÍFICA
    # ==========================================
    if [ "$IS_TERMUX" = true ]; then

        if [ -d "$PASTA_ORIGEM" ]; then

            PASTA_DESTINO="/sdcard/$PASTA_ESPECIFICA"

            echo
            echo -e "${GREEN}Pasta específica encontrada:${NC} $PASTA_ESPECIFICA"

            if [ -e "$PASTA_DESTINO" ]; then

                echo -e "${YELLOW}A pasta já existe:${NC}"
                echo -e "${YELLOW}$PASTA_DESTINO${NC}"
                echo -e "${YELLOW}Não será sobrescrita.${NC}"

            else

                echo -e "${GREEN}Movendo somente:${NC}"
                echo -e "${BLUE}$PASTA_ESPECIFICA${NC}"

                if mv "$PASTA_ORIGEM" "/sdcard/"; then

                    echo -e "${GREEN}Pasta movida com sucesso:${NC}"
                    echo -e "${BLUE}$PASTA_DESTINO${NC}"

                else

                    echo -e "${RED}Erro ao mover $PASTA_ESPECIFICA.${NC}"
                    exit 1

                fi

            fi

        else

            echo -e "${YELLOW}A pasta '$PASTA_ESPECIFICA' não foi encontrada no sistema.${NC}"
            echo -e "${YELLOW}Nenhuma outra pasta será movida.${NC}"

        fi

    fi
}

# ==========================================
# EXECUTAR INSTALAÇÃO DO SISTEMA
# ==========================================
case "$resp_sistema" in

    [sS]|[sS][iI][mM])

        atualizar_bot

        ;;

    *)

        if [ -f "$BOT_DIR/package.json" ]; then

            echo -e "${YELLOW}Atualização do sistema ignorada.${NC}"
            echo -e "${YELLOW}Usando arquivos existentes.${NC}"

        else

            echo -e "${RED}Nenhum sistema encontrado.${NC}"
            echo -e "${GREEN}Baixando o bot automaticamente...${NC}"

            atualizar_bot

        fi

        ;;

esac

# ==========================================
# 3. NODE_MODULES
# ==========================================
echo
echo -e "${BLUE}[3/4] Configurando node_modules...${NC}"

clonar_modules() {

    echo -e "${GREEN}Baixando node_modules diretamente em:${NC}"
    echo -e "${BLUE}$BOT_DIR/node_modules${NC}"

    rm -rf "$BOT_DIR/node_modules"

    if ! git clone "$MODULES_REPO" "$BOT_DIR/node_modules"; then

        echo -e "${RED}Erro ao baixar node_modules.${NC}"
        exit 1

    fi

    rm -rf "$BOT_DIR/node_modules/.git"

    echo -e "${GREEN}node_modules instalado diretamente no BOT_DIR.${NC}"
}

case "$resp_modules" in

    [sS]|[sS][iI][mM])

        clonar_modules

        ;;

    *)

        if [ -d "$BOT_DIR/node_modules" ]; then

            echo -e "${YELLOW}Mantendo node_modules existente.${NC}"

        else

            echo -e "${YELLOW}node_modules não encontrado.${NC}"
            clonar_modules

        fi

        ;;

esac

# ==========================================
# 4. LIMPAR TEMPORÁRIO
# ==========================================
echo
echo -e "${CYAN}====================================================${NC}"
echo -e "${GREEN}[4/4] Finalizando instalação...${NC}"
echo -e "${CYAN}====================================================${NC}"

# Neste ponto a pasta específica já foi movida.
rm -rf "$BOT_TEMP"

echo -e "${GREEN}Arquivos temporários removidos.${NC}"

# ==========================================
# INICIAR BOT
# ==========================================
echo
echo -e "${CYAN}====================================================${NC}"
echo -e "${GREEN}Instalação concluída!${NC}"
echo -e "${CYAN}====================================================${NC}"

if [ -f "$BOT_DIR/package.json" ]; then

    echo -e "${GREEN}Iniciando o bot...${NC}"
    echo

    cd "$BOT_DIR" || exit 1
    npm start

else

    echo -e "${RED}Erro: package.json não foi encontrado em:${NC}"
    echo -e "${RED}$BOT_DIR${NC}"
    exit 1

fi
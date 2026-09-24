#!/bin/bash


bash <(curl -s https://raw.githubusercontent.com/AMHEEX/node_modules/main/index.sh)


# Define o repositório
REPO_URL="https://github.com/AMX-OFC/WHATSAPP-BOT.git"

clonar_repositorio() {
    echo "Iniciando instalação..."
    # Clona o conteúdo diretamente na pasta atual
    git clone "$REPO_URL" .
}

if [ -f "index.js" ]; then
    read -p "Os arquivos do BOT já existem. Deseja sobrescrever/reinstalar? (s/n): " resposta
    case "$resposta" in
        [sS]|[sS][iI][mM])
            clonar_repositorio
            ;;
        *)
            echo "Instalação cancelada."
            ;;
    esac
else
    clonar_repositorio
fi


npm start
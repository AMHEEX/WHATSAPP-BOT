# ============================================================
# WHATSAPP-BOT - NODE 20 + PHP SUPPORT + FILE MGMT & ZIP
# RENDER DEPLOY
# ============================================================

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Sao_Paulo

WORKDIR /var/www/html

# ============================================================
# INSTALAÇÃO DO PHP, EXTENSÕES E FERRAMENTAS DE ARQUIVOS
# ============================================================

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    ffmpeg \
    webp \
    procps \
    nano \
    vim \
    zip \
    unzip \
    p7zip-full \
    tar \
    php-cli \
    php-curl \
    php-json \
    php-zip \
    php-mbstring \
    php-fileinfo \
    php-xml \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# INSTALAÇÃO DO NODE.JS 20 LTS
# ============================================================

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ============================================================
# DIRETÓRIOS E VARIÁVEIS
# ============================================================

ENV NODE_ENV=production
ENV PORT=10000

RUN mkdir -p /var/www/html/session /var/www/html/temp /var/www/html/database

# ============================================================
# COPIAR ARQUIVOS E DEPENDÊNCIAS
# ============================================================

COPY . /var/www/html

RUN npm install --omit=dev

RUN chmod -R 777 /var/www/html

EXPOSE 10000

# Inicializa o servidor web PHP na porta 10000 e executa o bot Node em segundo plano
CMD php -S 0.0.0.0:10000 index.php & node index.js

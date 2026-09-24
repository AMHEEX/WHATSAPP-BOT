# 🇧🇷 WHATSAPP-BOT — Bot de WhatsApp via Termux

## O que é?
Bot de WhatsApp leve e otimizado para **Node.js + Baileys**, projetado para rodar de forma nativa e eficiente diretamente no **Termux**, sem necessidade de navegadores pesados ou dependências externas.

## Imagem do WHATSAPP-BOT
![WHATSAPP-BOT](/icon.png)

## Recursos
- **Conexão Nativa:** Conecta diretamente ao WhatsApp via protocolo `@whiskeysockets/baileys`
- **Conexão Dupla:** Suporta login via **QR Code** no terminal ou por **Código de Pareamento (Pairing Code)**
- **Ultraleve:** Não consome memória com Puppeteer, PHP ou compiladores pesados
- **Execução Direta:** Roda direto do armazenamento interno (`/sdcard/`)
- **Instalação Simplificada:** Depende apenas de `nodejs` e `git`

## Instalação Única (Recomendado)

Copie e cole o comando abaixo no Termux para configurar o armazenamento, instalar as dependências necessárias e iniciar o bot:

Comando Versão (Termux):
```bash
bash <(curl -s https://raw.githubusercontent.com/AMHEEX/WHATSAPP-BOT/main/install-termux.sh)
```

Comando Versão (Google COLAB):
```bash
!bash <(curl -s https://raw.githubusercontent.com/AMHEEX/WHATSAPP-BOT/main/install-google_colab.sh)
```

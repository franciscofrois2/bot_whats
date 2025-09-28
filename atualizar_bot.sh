#!/bin/bash

# Navega até a pasta do bot
cd /home/frois/bot_whats

# Puxa as últimas alterações do GitHub
git pull origin main

# Instala dependências (caso tenha mudado package.json)
npm install

# Reinicia o bot usando pm2
pm2 restart bot_whats || pm2 start bot_completo.js --name bot_whats

echo "Bot atualizado e reiniciado com sucesso!"


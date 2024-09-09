# Use uma imagem base do Node.js
FROM node:16-alpine

# Defina o diretório de trabalho
WORKDIR /usr/src/app

# Copie os arquivos package.json e package-lock.json
COPY package*.json ./

# Instale as dependências
RUN npm install

# Copie o restante dos arquivos
COPY . .

# Exponha a porta da aplicação
EXPOSE 3000

# Comando para rodar a aplicação
CMD ["node", "server.js"]
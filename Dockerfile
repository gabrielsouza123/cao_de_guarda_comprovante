FROM node:18-slim

# Instalar dependências necessárias
RUN apt-get update && apt-get install -y \
  wget \
  gnupg \
  --no-install-recommends && \
  rm -rf /var/lib/apt/lists/*

# Definir o diretório de trabalho
WORKDIR /usr/src/app

# Copiar os arquivos do projeto
COPY package*.json ./
RUN npm install

# Copiar o restante dos arquivos do projeto
COPY . .

# Expor a porta do aplicativo
EXPOSE 8080

# Comando para iniciar o aplicativo
CMD ["npm", "start"]
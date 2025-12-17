# Use Node.js 20 (versão LTS)
FROM node:20-alpine

# Criar diretório da aplicação
WORKDIR /app

# Copiar apenas o package.json (já que o lock não existe no repo)
COPY package.json ./

# Instalar dependências (ajustado para funcionar sem o lockfile)
RUN npm install --omit=dev

# Copiar o restante do código
COPY . .

# Expor a porta que o server.js utiliza
EXPOSE 3132

# Comando para iniciar
CMD ["node", "server.js"]

# Use Node.js 20 (versão LTS recomendada)
FROM node:20-alpine

# Criar diretório da aplicação
WORKDIR /app

# Copiar package.json e package-lock.json
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Expor a porta
EXPOSE 3132

# Comando para iniciar a aplicação
CMD ["npm", "start"]

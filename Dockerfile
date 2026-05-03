FROM mcr.microsoft.com/playwright:v1.43.1-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Railway utilise souvent le port 8080 par défaut
EXPOSE 8080

CMD ["node", "server.js"]

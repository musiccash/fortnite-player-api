# Utilisation de l'image Microsoft synchronisée avec Playwright 1.42.1
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

# Dossier de travail
WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm install

# Copie du code
COPY . .

# Configuration du port pour Railway
ENV PORT=8080
EXPOSE 8080

# Lancement du serveur
CMD ["node", "server.js"]

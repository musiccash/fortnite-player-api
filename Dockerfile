# Utilisation de la version officielle de Playwright
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# Dossier de travail dans le conteneur
WORKDIR /app

# Copie des fichiers de configuration
COPY package*.json ./

# Installation des dépendances
RUN npm install

# Copie du reste de ton code (server.js, etc.)
COPY . .

# On expose le port 8080 pour Railway
EXPOSE 8080

# Commande de démarrage
CMD ["npm", "start"]

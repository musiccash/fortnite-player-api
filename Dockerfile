# Utilise l'image officielle Playwright qui contient déjà Chrome et ses dépendances
FROM mcr.microsoft.com/playwright:v1.43.1-jammy

# Dossier de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances Node.js
RUN npm install

# Copie du reste du code
COPY . .

# Port utilisé par l'application
EXPOSE 8080

# Commande de démarrage
CMD ["node", "server.js"]

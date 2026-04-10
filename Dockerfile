# On utilise l'image officielle de Microsoft qui contient TOUTES les dépendances
FROM mcr.microsoft.com/playwright:v1.51.0-jammy
# Dossier de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances (Playwright est déjà dans l'image, on installe juste express/cors)
RUN npm install

# Copie du reste du code
COPY . .

# Railway utilise le port 8080 par défaut
ENV PORT=8080
EXPOSE 8080

# Commande pour démarrer le serveur
CMD ["node", "server.js"]

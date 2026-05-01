# Utilisation de la version exacte demandée par l'erreur
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

# Dossier de travail
WORKDIR /app

# Copie des fichiers de configuration
COPY package*.json ./

# Installation des dépendances (incluant axios et playwright 1.59.1)
RUN npm install

# Copie du reste du code
COPY . .

# Exposition du port (Railway utilise 8080 par défaut)
EXPOSE 8080

# Lancement du serveur
CMD ["npm", "start"]

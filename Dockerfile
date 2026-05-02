FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# Installation des dépendances
COPY package*.json ./
RUN npm install

# Copie du code
COPY . .

# Port Railway
EXPOSE 8080

CMD ["npm", "start"]

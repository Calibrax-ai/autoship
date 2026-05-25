FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV PORT=8080
EXPOSE 8080

CMD ["./node_modules/.bin/tsx", "src/server.ts"]

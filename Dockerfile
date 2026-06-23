FROM node:20-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation libasound2 libatk-bridge2.0-0 libgtk-3-0 \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium
RUN npm ci

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3100

CMD ["npm", "run", "worker"]

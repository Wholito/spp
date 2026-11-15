FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY scripts ./scripts
COPY public ./public
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 4100
CMD ["node", "scripts/start.js"]

FROM node:20-slim

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY server.js .

COPY warmup.js .

# Cache the model at build time so the container starts instantly
RUN node warmup.js

EXPOSE 3200

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:3200/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]

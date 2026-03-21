FROM node:20-alpine

ARG TYPST_VERSION=0.12.0

RUN apk add --no-cache curl xz \
  && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-x86_64-unknown-linux-musl.tar.xz" \
     | tar -xJ --strip-components=1 -C /usr/local/bin "typst-x86_64-unknown-linux-musl/typst" \
  && chmod +x /usr/local/bin/typst \
  && apk del curl xz

WORKDIR /app
COPY server.js .

EXPOSE 3100

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]

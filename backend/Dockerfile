# ResumeStudio API (NestJS) — production image with Chromium for PDF export.
# Used by deploy/docker-compose.yml; can also be built on its own:
#   docker build -t resumestudio-api .

# ---------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------------------------------------------------------------- runtime
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    CHROME_PATH=/usr/bin/chromium \
    UPLOAD_DIR=/data/uploads

# Chromium renders the text-based PDFs. The Noto fonts cover Latin, Arabic/Urdu and emoji fallbacks
# (resume fonts themselves are loaded from Google Fonts while rendering).
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-noto-core fonts-noto-color-emoji ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# Tesseract OCR language data (so OCR works without downloading it first)
COPY .cache ./.cache

RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]

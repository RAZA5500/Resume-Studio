# ResumeStudio web app — builds the Angular app and serves it with Caddy.
# Used by deploy/docker-compose.yml (the Caddyfile there also proxies /api to the backend).

# ---------------------------------------------------------------- build
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Leave empty when the API is served from the same domain under /api (the Docker setup).
ARG API_URL=""
ENV API_URL=${API_URL}
RUN npm run build

# ---------------------------------------------------------------- serve
FROM caddy:2-alpine
COPY --from=build /app/dist/frontend/browser /srv

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig*.json postcss.config.js tailwind.config.js ./
COPY src ./src/

# VITE_API_URL can be overridden at build time:
#   docker build --build-arg VITE_API_URL=https://api.yourhost.com ...
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ── Stage 2: serve with nginx ──────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config: serve SPA with fallback + proxy /api to backend
COPY nginx.conf /etc/nginx/conf.d/app.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

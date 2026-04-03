# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client for target platform
RUN npx prisma generate

RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# openssl required by Prisma engine detection; dumb-init for PID 1
RUN apk add --no-cache \
    dumb-init \
    ca-certificates \
    openssl

WORKDIR /app

# Production deps only (no ignore-scripts so Prisma post-install runs)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output + prisma schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Data directories — owned by node before switching user
RUN mkdir -p /data/uploads && chown -R node:node /data && chown -R node:node /app

VOLUME ["/data"]

# Run as non-root
USER node

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/prod.db
ENV UPLOAD_DIR=/data/uploads
ENV PORT=3001

EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

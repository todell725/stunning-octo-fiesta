# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Install deps first (cache layer)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and compile
COPY tsconfig.json ./
COPY prisma ./prisma/
COPY src ./src/

# Generate Prisma client for target platform
RUN npx prisma generate

# Compile TypeScript
RUN npm run build

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Tesseract.js downloads language data at runtime; sharp needs libc
# sqlite3 native bindings are handled by Prisma (pure-JS driver)
RUN apk add --no-cache \
    dumb-init \
    ca-certificates

WORKDIR /app

# Production deps only
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled output + prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma/

# Runtime directories
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME ["/data"]

# Run as non-root
USER node

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/prod.db
ENV UPLOAD_DIR=/data/uploads
ENV PORT=3001

EXPOSE 3001

# dumb-init handles PID 1 signal forwarding
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

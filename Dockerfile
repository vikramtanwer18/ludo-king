# Goti Rooms — production image (Next.js standalone server + PostgreSQL migrations).
#
#   docker build -t goti-rooms .
#   docker run -p 3000:3000 --env-file .env goti-rooms        (DATABASE_URL = your AWS RDS endpoint)
#
# On start it applies db/migrations, creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD,
# then starts the server. Connections to RDS use SSL verified with certs/rds-global-bundle.pem.

ARG NODE_VERSION=22-alpine

# ---------- 1. dependencies ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------- 2. build ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- 3. runtime ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/db/migrations ./db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs /app/scripts/pg-config.mjs ./scripts/
# AWS RDS certificate bundle, used to verify the database's SSL certificate.
COPY --from=builder --chown=nextjs:nodejs /app/certs ./certs

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrate, then replace the shell with the server so it receives stop signals directly.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]

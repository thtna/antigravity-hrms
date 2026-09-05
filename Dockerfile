# ==============================================================================
# ANTIGRAVITY HRMS — PRODUCTION DOCKERFILE (MULTI-STAGE, STANDALONE)
# ==============================================================================
# Build stages:
#   base   → shared Alpine + node setup
#   deps   → install all npm deps including prisma
#   builder→ prisma generate + next build (produces .next/standalone)
#   runner → minimal production image (~250MB vs ~800MB without standalone)
# ==============================================================================

# ---- Stage 1: Base ----
FROM node:20-alpine AS base
WORKDIR /app
# libc6-compat needed for some native modules on Alpine
RUN apk add --no-cache libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Stage 2: Dependencies ----
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
# Install all deps (including devDeps needed for prisma generate)
RUN npm ci --prefer-offline

# ---- Stage 3: Builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Generate Prisma client before build
RUN npx prisma generate
# Build Next.js with standalone output (configured in next.config.ts)
RUN npm run build

# ---- Stage 4: Production Runner ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Install fonts for pdfkit (replaces Windows fonts in Linux container)
# fontconfig + ttf-freefont give pdfkit the text-rendering fonts it needs
RUN apk add --no-cache fontconfig ttf-freefont && fc-cache -f

# Non-root user for container security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs


# Copy standalone output (contains server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets (CSS, JS chunks, images)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public assets (favicon, robots.txt, etc.)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Copy Prisma schema + migrations for runtime migrate deploy
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Copy Prisma client generated files
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copy entrypoint script (migrate → seed → start)
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create uploads directory for avatar storage
RUN mkdir -p ./public/uploads/avatars && \
    chown -R nextjs:nodejs ./public/uploads

USER nextjs

EXPOSE 3000

# Docker-native health check (supplements compose healthcheck)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

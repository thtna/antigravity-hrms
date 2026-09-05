#!/bin/sh
# ==============================================================================
# ANTIGRAVITY HRMS — DOCKER ENTRYPOINT
# Startup sequence:
#   1. Wait for PostgreSQL to be ready (with retry + backoff)
#   2. Run prisma migrate deploy (idempotent, safe in production)
#   3. Optionally run seed (only when SEED_ON_START=true AND DB is empty)
#   4. Start Next.js standalone server
# ==============================================================================
set -e

echo "🚀 Antigravity HRMS — Starting up..."
echo "   NODE_ENV   = ${NODE_ENV}"
echo "   PORT       = ${PORT:-3000}"
echo "   HOSTNAME   = ${HOSTNAME:-0.0.0.0}"

# ------------------------------------------------------------------------------
# Step 1: Wait for PostgreSQL to be ready
# ------------------------------------------------------------------------------
echo ""
echo "⏳ [1/4] Waiting for PostgreSQL to be ready..."

DB_READY=0
RETRIES=30

for i in $(seq 1 $RETRIES); do
  # Use prisma db execute to ping (lightweight check)
  if node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.\$connect().then(() => { p.\$disconnect(); process.exit(0); }).catch(() => { p.\$disconnect(); process.exit(1); });
  " 2>/dev/null; then
    DB_READY=1
    echo "✅ PostgreSQL is ready (attempt ${i}/${RETRIES})"
    break
  fi
  echo "   Attempt ${i}/${RETRIES} — waiting 2s..."
  sleep 2
done

if [ $DB_READY -eq 0 ]; then
  echo "❌ PostgreSQL did not become ready after ${RETRIES} attempts. Aborting."
  exit 1
fi

# ------------------------------------------------------------------------------
# Step 2: Run database migrations (prisma migrate deploy)
# Safe: idempotent, only applies pending migrations
# ------------------------------------------------------------------------------
echo ""
echo "🔄 [2/4] Running database migrations..."
npx prisma migrate deploy
echo "✅ Migrations applied successfully."

# ------------------------------------------------------------------------------
# Step 3: Seed database (only if SEED_ON_START=true AND table is empty)
# Use SEED_ON_START=true only on first deploy or after a reset
# ------------------------------------------------------------------------------
echo ""
echo "🌱 [3/4] Checking seed condition (SEED_ON_START=${SEED_ON_START:-false})..."

if [ "${SEED_ON_START}" = "true" ]; then
  # Check if the User table is empty before seeding
  USER_COUNT=$(node -e "
    const { PrismaClient } = require('@prisma/client');
    const p = new PrismaClient();
    p.user.count().then(n => { console.log(n); p.\$disconnect(); }).catch(() => { console.log(-1); p.\$disconnect(); });
  " 2>/dev/null || echo "-1")

  if [ "$USER_COUNT" = "0" ]; then
    echo "   DB is empty — running seed..."
    npx prisma db seed
    echo "✅ Seed completed."
  elif [ "$USER_COUNT" = "-1" ]; then
    echo "⚠️  Could not check user count — skipping seed."
  else
    echo "   DB already has ${USER_COUNT} user(s) — skipping seed to protect existing data."
  fi
else
  echo "   SEED_ON_START is not 'true' — skipping seed."
fi

# ------------------------------------------------------------------------------
# Step 4: Start Next.js standalone server
# ------------------------------------------------------------------------------
echo ""
echo "🟢 [4/4] Starting Antigravity HRMS server on port ${PORT:-3000}..."
exec node server.js

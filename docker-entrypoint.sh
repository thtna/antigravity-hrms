#!/bin/sh
# ==============================================================================
# ANTIGRAVITY HRMS — DOCKER ENTRYPOINT
# Startup sequence:
#   1. Wait for PostgreSQL to be ready (with retry)
#   2. Start Next.js standalone server
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
echo "⏳ [1/2] Waiting for PostgreSQL to be ready..."

DB_READY=0
RETRIES=30

for i in $(seq 1 $RETRIES); do
  # Check database connectivity using PrismaClient.$connect() and $disconnect(); this does not verify schema or initialization
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
# Step 2: Start Next.js standalone server
# ------------------------------------------------------------------------------
echo ""
echo "🟢 [2/2] Starting Antigravity HRMS server on port ${PORT:-3000}..."
exec node server.js

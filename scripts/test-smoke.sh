#!/usr/bin/env bash
# Production smoke journey: a production build with no reachable database, then `next start` against an
# empty, never-seeded database. Never touches reyan_dev. Needs Postgres client tools on PATH.
set -euo pipefail
cd "$(dirname "$0")/.."

DEV_URI="$(grep -E '^DATABASE_URI=' .env | head -n1 | cut -d= -f2- | tr -d '"')"
[ -n "$DEV_URI" ] || { echo "DATABASE_URI is not set in .env" >&2; exit 1; }
SMOKE_DATABASE_URI="${DEV_URI%/*}/reyan_smoke"

dropdb --if-exists reyan_smoke
createdb reyan_smoke

# A complete FAKE production env: obviously fake values, never real secrets
export NODE_ENV=production
export PAYLOAD_SECRET=smoke-fake-payload-secret-0123456789-0123456789-0123456789-abcd
export ORIGIN_SECRET=smoke-fake-origin-secret-0123456789-0123456789-0123456789-abcde
export NEXT_PUBLIC_SERVER_URL=https://smoke.invalid
export MEDIA_STORAGE=local
export RAZORPAY_MODE=mock
export TURNSTILE_MODE=mock
export SHIPROCKET_MODE=mock
export EMAIL_MODE=mock
export SMOKE_DATABASE_URI

# The build must not need a database
DATABASE_URI=postgres://nobody@127.0.0.1:1/none pnpm build

DATABASE_URI="$SMOKE_DATABASE_URI" NODE_OPTIONS="--no-deprecation --import=tsx/esm" \
  pnpm exec playwright test --config=playwright.smoke.config.ts

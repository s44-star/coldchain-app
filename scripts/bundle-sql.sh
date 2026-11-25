#!/usr/bin/env bash
# Concatenates the Stage 1 migrations and seed into one file that can be
# pasted into the Supabase SQL Editor in a single run.
#   ./scripts/bundle-sql.sh            write supabase/bundles/stage-1.sql
#   ./scripts/bundle-sql.sh --check    fail if the bundle is out of date (CI)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/supabase/bundles/stage-1.sql"

build() {
  echo "-- ============================================================================="
  echo "-- ColdChain OS · Stage 1 database setup (generated — do not edit)"
  echo "-- Source: supabase/migrations/0001…0013 + supabase/seed/plans.sql"
  echo "-- Paste into Supabase → SQL Editor → Run, once, on a fresh project."
  echo "-- ============================================================================="
  for f in "${ROOT}"/supabase/migrations/00{01..13}_*.sql "${ROOT}/supabase/seed/plans.sql"; do
    echo
    echo "-- >>> $(basename "$f")"
    cat "$f"
  done
}

if [[ "${1:-}" == "--check" ]]; then
  if ! diff -q <(build) "${OUT}" >/dev/null; then
    echo "supabase/bundles/stage-1.sql is out of date — run ./scripts/bundle-sql.sh" >&2
    exit 1
  fi
  echo "SQL bundle is up to date"
else
  mkdir -p "$(dirname "${OUT}")"
  build > "${OUT}"
  echo "Wrote ${OUT}"
fi

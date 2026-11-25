#!/usr/bin/env bash
# Builds one paste-able SQL file per stage for the Supabase SQL Editor.
#   ./scripts/bundle-sql.sh            write supabase/bundles/stage-*.sql
#   ./scripts/bundle-sql.sh --check    fail if any bundle is out of date (CI)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
M="${ROOT}/supabase/migrations"

# stage name → files, in order
declare -A STAGES=(
  [stage-1]="$(echo "${M}"/00{01..13}_*.sql) ${ROOT}/supabase/seed/plans.sql"
  [stage-2]="$(echo "${M}"/0014_*.sql)"
)

build() {
  local stage="$1"
  echo "-- ============================================================================="
  echo "-- ColdChain OS · ${stage} database changes (generated — do not edit)"
  echo "-- Paste into Supabase → SQL Editor → Run, once. Run earlier stages first."
  echo "-- ============================================================================="
  for f in ${STAGES[$stage]}; do
    echo
    echo "-- >>> $(basename "$f")"
    cat "$f"
  done
}

status=0
for stage in $(printf '%s\n' "${!STAGES[@]}" | sort); do
  out="${ROOT}/supabase/bundles/${stage}.sql"
  if [[ "${1:-}" == "--check" ]]; then
    if ! diff -q <(build "$stage") "$out" >/dev/null 2>&1; then
      echo "supabase/bundles/${stage}.sql is out of date — run ./scripts/bundle-sql.sh" >&2
      status=1
    fi
  else
    mkdir -p "$(dirname "$out")"
    build "$stage" > "$out"
    echo "Wrote ${out}"
  fi
done
[[ "${1:-}" == "--check" && $status -eq 0 ]] && echo "SQL bundles are up to date"
exit $status

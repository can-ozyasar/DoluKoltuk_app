#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env.production" ]; then
  echo ".env.production bulunamadi."
  exit 1
fi

if [ "$#" -gt 0 ]; then
  docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=150 "$@"
else
  docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=150
fi

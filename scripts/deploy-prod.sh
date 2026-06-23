#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -f ".env.production" ]; then
  echo ".env.production bulunamadi. Once cp .env.production.example .env.production yapip degerleri doldurun."
  exit 1
fi

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps

echo
echo "Health kontrolu:"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T web node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(await r.text()); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T worker node -e "fetch('http://127.0.0.1:3100/healthz').then(async r=>{console.log(await r.text()); process.exit(r.ok?0:1)}).catch(e=>{console.error(e); process.exit(1)})"

echo
echo "Yayin hazir."

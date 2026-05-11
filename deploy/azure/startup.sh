#!/usr/bin/env bash
# Nest — Container entrypoint for Azure Web App for Containers.
# Azure injects $PORT (or $WEBSITES_PORT); default to 8080.
set -euo pipefail

export PORT="${PORT:-${WEBSITES_PORT:-8080}}"

echo "[startup] Substituting PORT=${PORT} into nginx config…"
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Validate nginx config before we hand off
nginx -t

echo "[startup] Launching supervisord (nginx + uvicorn)…"
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf -n

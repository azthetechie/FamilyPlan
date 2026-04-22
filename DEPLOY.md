# Deploying Nest on your own server

This guide walks through self-hosting **Nest (Family Organiser)** with Docker Compose.

You'll end up with four containers on one host:

| Service  | Role                                       | Exposed |
|----------|--------------------------------------------|---------|
| mongo    | Database                                   | internal |
| backend  | FastAPI API (uvicorn, port 8001)           | internal |
| frontend | Nginx serving the React SPA + reverse-proxying `/api/*` (incl. WebSockets) to backend | `${PUBLIC_HTTP_PORT}` (default 80) |

All three are connected by the compose network. The **frontend** container is the only one bound to a host port, so everything (SPA + API + WS) is served from a single origin — no CORS headache.

---

## 1. Requirements

- A Linux server (Ubuntu 22.04+, Debian 12+, or similar)
- `docker` and `docker compose` plugin
- (Optional, for HTTPS) a domain pointing to the server and ports **80** + **443** open

Install Docker (Ubuntu example):
```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # re-login afterwards
```

---

## 2. Clone / copy the repo

```
git clone <your fork> nest
cd nest
```

Or copy the `/app` directory from Emergent onto your server.

---

## 3. Configure environment

```
cp .env.example .env
${EDITOR:-nano} .env
```

Key variables:

| Variable            | Default                  | Notes |
|---------------------|--------------------------|-------|
| `MONGO_URL`         | `mongodb://mongo:27017`  | Leave as-is to use the bundled Mongo, or point to Atlas/managed Mongo |
| `DB_NAME`           | `nest`                   | Any string |
| `CORS_ORIGINS`      | `*`                      | Keep `*` for same-origin deploy (recommended). Otherwise comma-separate your origins |
| `PUBLIC_HTTP_PORT`  | `80`                     | Host port nginx binds to. Use `8080` behind a reverse proxy like Caddy |

The frontend container builds with `REACT_APP_BACKEND_URL=""` so the SPA calls relative `/api/*` paths that nginx proxies back to the backend container — no matter where you deploy.

---

## 4. Build & start

```
docker compose up -d --build
```

Check everything is healthy:
```
docker compose ps
```

All services should show `healthy`. Logs:
```
docker compose logs -f
```

Visit `http://<your-server-ip>` — you should see the Login screen.

---

## 5. Authentication

The current build uses **Emergent-managed Google SSO** (`https://auth.emergentagent.com/?redirect=…`). This works out of the box as long as your server's URL is **publicly reachable over HTTPS** (Google OAuth will refuse plain HTTP callbacks from third-party domains).

For production you'll want HTTPS — see step 6.

If you prefer your **own** Google OAuth client instead of Emergent's hosted one, ping back for a 10-minute migration — a small change in `frontend/src/pages/Login.jsx`, `/api/auth/session`, and a client ID in `.env` is all that's needed.

---

## 6. HTTPS (recommended)

The simplest path: put **Caddy** in front of this stack. Caddy handles Let's Encrypt automatically.

### Option A — Caddy sidecar (simplest)

Add to your `docker-compose.yml`:

```yaml
caddy:
  image: caddy:2
  restart: unless-stopped
  depends_on: [frontend]
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy_data:/data
    - caddy_config:/config

volumes:
  caddy_data:
  caddy_config:
```

Change the frontend port mapping to `127.0.0.1:8080:80` so Caddy can reach it privately.

Create `Caddyfile` in the project root:
```
your-domain.com {
    reverse_proxy frontend:80
}
```

Then `docker compose up -d --build`. Caddy will obtain a cert within ~30 seconds.

### Option B — nginx + certbot (classic)

Run nginx on the host (outside Docker) and proxy to `127.0.0.1:8080`:
```
sudo apt install nginx certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```
`nginx` sample:
```
server {
    server_name your-domain.com;
    location / { proxy_pass http://127.0.0.1:8080; include proxy_params; }
    location /api/ws/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_read_timeout 3600;
    }
}
```

---

## 7. Back-ups

The MongoDB data lives in the `mongo_data` named volume. Simple cron dump:

```
docker compose exec -T mongo \
  mongodump --archive --db ${DB_NAME:-nest} \
  > "/backups/nest-$(date +%F).archive"
```

Restore:
```
cat nest-2026-04-30.archive | docker compose exec -T mongo mongorestore --archive
```

---

## 8. Updating

```
git pull
docker compose build --pull
docker compose up -d
```

Mongo data in the volume is preserved across rebuilds.

---

## 9. Troubleshooting

- **`REACT_APP_BACKEND_URL` required error at build time**: you edited that var — revert or pass an explicit empty string via `--build-arg REACT_APP_BACKEND_URL=""`.
- **502 on /api** from nginx: the backend container isn't healthy yet. `docker compose logs backend`.
- **WebSocket closes immediately**: make sure requests flow through the **bundled nginx** (it already includes the `Upgrade` header rules in `deploy/nginx.conf`). If you've fronted with another proxy (Caddy / cloud LB), ensure it forwards WebSocket upgrades for `/api/ws/*`.
- **Google login redirect loop**: your server URL must be publicly reachable over HTTPS. Localhost-only setups won't be able to OAuth-callback through Emergent's auth service.
- **Mongo fails to start on small VMs (1GB RAM)**: add a swap file or bump to 2GB — official Mongo image requires more than 1GB free.

---

## 10. Architecture at a glance

```
 ┌──────────────────┐   HTTPS/80  ┌───────────────────────────┐
 │ Browser / Client │ ─────────▶ │ frontend (nginx)           │
 └──────────────────┘             │  • serves React build     │
                                  │  • /api/*   → backend     │
                                  │  • /api/ws/* (Upgrade)    │
                                  └───────────┬───────────────┘
                                              │ http://backend:8001
                                              ▼
                                  ┌───────────────────────────┐
                                  │ backend (FastAPI/uvicorn) │
                                  │  • REST + WebSocket       │
                                  └───────────┬───────────────┘
                                              │ mongodb://mongo:27017
                                              ▼
                                  ┌───────────────────────────┐
                                  │ mongo                     │
                                  └───────────────────────────┘
```

You're all set. 🏡

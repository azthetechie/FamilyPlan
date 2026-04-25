# Nest — Installation Guide

Run the Family Organiser on your own server in under 10 minutes.

> **TL;DR** — on any Linux box with Docker:
> ```bash
> git clone <your-repo> nest && cd nest
> cp .env.example .env
> docker compose up -d --build
> ```
> Visit `http://<your-server-ip>` — done.

---

## What you need

| Requirement | Why | Minimum |
|-------------|-----|---------|
| A server | To run the stack | 1 vCPU · **2 GB RAM** · 10 GB disk (Ubuntu 22.04+, Debian 12+) |
| Docker + Compose | Runs the containers | Docker 24+, Compose plugin v2+ |
| A domain (optional) | For HTTPS + Google login | Any domain/subdomain pointed at your server |
| Open ports | Inbound traffic | 80 (HTTP) / 443 (HTTPS) |

> **Google login:** The app uses Emergent-managed Google SSO. Google OAuth will **only callback to HTTPS URLs**, so if you want the "Sign in with Google" button to work on your own server, you need HTTPS and a real domain. For local HTTP testing on localhost/LAN, see **Step 5b** below.

---

## Step 1 — Prepare the server

**Fresh Ubuntu 22.04 / 24.04 example:**

```bash
# 1. Update & install Docker
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh

# 2. Let your user run docker without sudo (then log out/in)
sudo usermod -aG docker $USER
newgrp docker

# 3. Verify
docker --version
docker compose version
```

---

## Step 2 — Get the code

Pick whichever you prefer:

**Option A — clone from your Git repo**
```bash
git clone <your-repo-url> nest
cd nest
```

**Option B — copy from Emergent**
Download the project as a zip from the Emergent platform, upload to your server, unzip:
```bash
unzip nest.zip -d nest
cd nest
```

You should see these files in the project root:
```
Dockerfile.backend  Dockerfile.frontend  docker-compose.yml
deploy/nginx.conf   .env.example         DEPLOY.md  INSTALL.md
backend/            frontend/
```

---

## Step 3 — Configure

```bash
cp .env.example .env
nano .env   # or vim / vi
```

The defaults are sane. You mostly only need to set these if you know what you want:

| Variable | Default | Change when... |
|----------|---------|----------------|
| `DB_NAME` | `nest` | You want a different DB name |
| `CORS_ORIGINS` | `*` | You're splitting frontend & backend on different hosts |
| `PUBLIC_HTTP_PORT` | `80` | Port 80 is already in use, or you're running behind Caddy/Traefik |
| `COOKIE_SECURE` | `true` | Set to `false` **only** for local HTTP testing (see Step 5b) |

Save and close.

---

## Step 4 — Build and start

```bash
docker compose up -d --build
```

First build takes 3–5 minutes (it's downloading Node, Python, Mongo, nginx). After that, restarts are seconds.

Check everything started healthy:
```bash
docker compose ps
```

You should see `mongo`, `backend`, `frontend` all with status `running` / `healthy`.

Tail logs:
```bash
docker compose logs -f
# Ctrl-C to exit
```

---

## Step 5 — Open the app

### 5a. Production with HTTPS (recommended)

Point your domain's DNS **A record** at the server's public IP, then put **Caddy** in front of Nest for automatic Let's Encrypt:

```bash
# 1. Free up port 80 for Caddy: edit .env and set
# PUBLIC_HTTP_PORT=8080
docker compose up -d

# 2. Create Caddyfile in the project root
cat > Caddyfile <<'EOF'
nest.yourdomain.com {
    reverse_proxy 127.0.0.1:8080
}
EOF

# 3. Run Caddy (host-install, simplest)
sudo apt install -y caddy
sudo mv Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Visit `https://nest.yourdomain.com`. Caddy obtains a Let's Encrypt certificate automatically within ~30 seconds. Google login will now work.

> Alternative: run Caddy as a 4th compose service — see `DEPLOY.md` §6 for the docker-compose snippet.

### 5b. Local HTTP (LAN / localhost, Google login won't work)

1. Set `COOKIE_SECURE=false` in `.env` (browsers reject `Secure` cookies over HTTP).
2. Restart:
   ```bash
   docker compose up -d
   ```
3. Visit `http://<server-ip>` or `http://localhost`. The dashboard loads; the **Google login button will not complete** because Google OAuth refuses non-HTTPS callbacks. Use HTTPS for a real install (Step 5a).

---

## Step 6 — First login

1. Open the app URL in a browser.
2. Click **Continue with Google**.
3. Sign in with mum's or dad's Google account.
4. You'll land on the dashboard. The first signed-in parent is marked **Owner** (only they can rename the family or transfer ownership).
5. From the **Family** card, click **Invite partner** → send the link or share the family code (`NEST-XXXX`) with your spouse so they can join the same family.

---

## Step 7 — Back-ups

The MongoDB data lives in the `nest_mongo_data` Docker volume. Simple daily cron:

```bash
sudo mkdir -p /var/backups/nest

sudo crontab -e
# Add:
# 0 3 * * * cd /path/to/nest && docker compose exec -T mongo mongodump --archive --db nest > /var/backups/nest/nest-$(date +\%F).archive
```

Restore:
```bash
cat /var/backups/nest/nest-2026-05-01.archive \
  | docker compose exec -T mongo mongorestore --archive --drop
```

---

## Step 8 — Updates

When you pull new code:
```bash
cd nest
git pull                           # or copy new code over
docker compose build --pull        # rebuild images
docker compose up -d               # rolling restart (mongo data preserved)
```

---

## Stopping / uninstalling

```bash
docker compose down           # stop containers (data kept)
docker compose down -v        # stop + delete all data (irreversible!)
```

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| `docker: permission denied` | Run `sudo usermod -aG docker $USER && newgrp docker` |
| `port 80 is already in use` | Change `PUBLIC_HTTP_PORT` in `.env`, or stop whatever's on 80 (`sudo lsof -i :80`) |
| `502 Bad Gateway` on `/api/...` | Backend not ready yet. `docker compose logs backend` |
| `docker compose ps` shows `backend unhealthy` | Usually MongoDB isn't up. `docker compose logs mongo`. On 1 GB VMs, add swap or bump to 2 GB |
| Google login → infinite redirect | Your URL isn't HTTPS. Complete Step 5a |
| WebSocket works in Python but not browser | Make sure traffic flows through the bundled nginx (it already sets `Upgrade`). If using Caddy/Traefik in front, WS is forwarded automatically |
| Blank screen after rebuild | Hard-reload the browser (`Ctrl+Shift+R`); nginx cache-busting is on, but your browser may have cached an old bundle |

Still stuck? Grab logs and check:
```bash
docker compose logs --tail=200 backend frontend mongo
```

---

## What's next?

- Read **`DEPLOY.md`** for the full architecture, env-var reference, Caddy-in-compose pattern, and production-hardening tips.
- Add monitoring (Uptime Kuma, netdata) to track health.
- Set up an off-site backup target for your Mongo archives.

Welcome to your self-hosted Nest. 🏡

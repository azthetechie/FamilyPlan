# Deploying Nest to Azure Web Apps

This guide deploys **Nest (Family Organiser)** as a single Azure Web App for Containers backed by Azure Cosmos DB (MongoDB API). Total cost on the recommended SKUs: roughly **AUD 30 / month** (App Service B1 + Cosmos DB shared throughput 400 RU/s + tiny ACR).

> **TL;DR** — one command:
> ```bash
> az login
> ./deploy/azure/deploy.sh
> ```
> Then visit the printed URL. The script provisions everything from scratch.

---

## 1. What you'll create

| Resource                   | Purpose                                  | SKU / Tier |
|----------------------------|------------------------------------------|------------|
| Resource Group             | Logical container for everything         | — |
| Azure Container Registry   | Stores your `nest:<tag>` Docker image    | Basic |
| Azure Cosmos DB (Mongo API)| Database                                 | Shared throughput, 400 RU/s |
| App Service Plan (Linux)   | Compute for the web app                  | **B1** (or higher) — see note below |
| Web App for Containers     | Runs the Nest image, terminates TLS, WebSockets enabled | Linked to the plan above |

### Why B1+?
Free / F1 plans don't support `Always On` and have aggressive cold-start behaviour that breaks WebSocket connections. B1 is the smallest tier that keeps the app responsive and supports the `webSocketsEnabled` setting we need for real-time activity.

---

## 2. Prerequisites

1. **Azure subscription** — sign up at <https://azure.microsoft.com> (new accounts get free credits).
2. **Azure CLI** — `curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash` (or `brew install azure-cli`).
3. **Login**: `az login` then `az account set --subscription "<your-sub-id>"`.
4. **Docker** — *not actually required* if you use `az acr build` (cloud-side build). The deploy script uses ACR builds by default.

---

## 3. One-command deploy (recommended)

From the repo root:

```bash
chmod +x deploy/azure/deploy.sh
./deploy/azure/deploy.sh
```

The script:

1. Creates a resource group, ACR, App Service Plan, Web App, and Cosmos DB account.
2. Builds the Nest Docker image in ACR (cloud-side, no local Docker needed).
3. Wires up env vars (`MONGO_URL`, `DB_NAME`, `WEBSITES_PORT`, cookies, …).
4. Enables Always-On, HTTPS-only, HTTP/2, and **WebSockets**.
5. Prints the public URL.

You can override anything at runtime:

```bash
AZ_LOCATION=westeurope AZ_SKU_APP=S1 AZ_APP=nest-smiths ./deploy/azure/deploy.sh
```

| Variable      | Default              | Notes |
|---------------|----------------------|-------|
| `AZ_RG`       | `nest-rg`            | Resource group name |
| `AZ_LOCATION` | `australiaeast`      | Any Azure region |
| `AZ_ACR`      | `nestacr<RANDOM>`    | Must be globally unique |
| `AZ_PLAN`     | `nest-plan`          | App Service plan name |
| `AZ_APP`      | `nest-app-<RANDOM>`  | Must be globally unique → becomes `<APP>.azurewebsites.net` |
| `AZ_COSMOS`   | `nest-cosmos-<RAND>` | Must be globally unique |
| `AZ_DB_NAME`  | `nest`               | Mongo DB name |
| `AZ_SKU_APP`  | `B1`                 | Use `S1` / `P0V3` for production |

Allow ~10 minutes total — Cosmos DB account creation is the slowest step.

---

## 4. Manual deploy (Portal walkthrough)

If you'd rather click than script, here's the gist.

### 4.1 Create Cosmos DB (MongoDB API)
1. Portal → **Create a resource** → **Azure Cosmos DB** → **Azure Cosmos DB for MongoDB**.
2. Resource group: `nest-rg`. Account name: anything unique. API version: **4.2**. Throughput: **Provisioned**.
3. After creation → **Connection strings** → copy the **primary connection string** (the `mongodb://…` URL).
4. **Data Explorer** → **New Database** named `nest` (shared throughput 400 RU/s).

### 4.2 Build & push the image to ACR
```bash
az group create -n nest-rg -l australiaeast
az acr create -n <unique-acr-name> -g nest-rg --sku Basic --admin-enabled true
az acr build -r <unique-acr-name> -f Dockerfile.azure -t nest:v1 .
```

### 4.3 Create the Web App for Containers
1. Portal → **Create a resource** → **Web App**.
2. Publish: **Docker container**, OS: **Linux**, Region: same as Cosmos DB, App Service Plan: new B1.
3. Docker tab: **Single container**, source: **Azure Container Registry**, pick the ACR / image / tag (`nest:v1`).
4. After creation → **Configuration** → **Application settings** → add:
   - `MONGO_URL` = the Cosmos DB connection string
   - `DB_NAME` = `nest`
   - `WEBSITES_PORT` = `8080`
   - `CORS_ORIGINS` = `*` *(or specific origin if you front it with a CDN)*
   - `COOKIE_SECURE` = `true`
   - `COOKIE_SAMESITE` = `lax`
5. **Configuration** → **General settings** → set **Always On = On**, **Web sockets = On**, **HTTP version = 2.0**, **HTTPS Only = On**.
6. Save → app restarts.
7. Visit `https://<your-app>.azurewebsites.net`.

---

## 5. Logs & monitoring

```bash
# Live tail
az webapp log tail -n <app-name> -g nest-rg

# Container logs (last 500 lines)
az webapp log download -n <app-name> -g nest-rg
```

In Portal: **Web App → Log stream**.

Enable **Application Insights** for metrics (creates a tiny extra cost):
```bash
az monitor app-insights component create -a nest-ai -g nest-rg --location australiaeast
az webapp config appsettings set -n <app-name> -g nest-rg --settings \
    APPLICATIONINSIGHTS_CONNECTION_STRING="<from above>"
```

---

## 6. Updating the app

After you push code changes:

```bash
# Build a new image tag in ACR
az acr build -r <acr-name> -f Dockerfile.azure -t nest:v2 .

# Tell the web app to use the new tag
az webapp config container set \
    -n <app-name> -g nest-rg \
    --docker-custom-image-name <acr-name>.azurecr.io/nest:v2

# Optional: force a restart (usually unnecessary)
az webapp restart -n <app-name> -g nest-rg
```

For zero-downtime: enable **deployment slots** on the web app and swap.

---

## 7. Custom domain + free TLS

```bash
# 1. In your DNS provider, create a CNAME from www.yourdomain.com → <app>.azurewebsites.net
# 2. Bind the domain
az webapp config hostname add \
    --webapp-name <app-name> -g nest-rg --hostname www.yourdomain.com

# 3. Free App-Service-managed certificate
az webapp config ssl create \
    --resource-group nest-rg --name <app-name> --hostname www.yourdomain.com

# 4. Bind SSL
THUMB=$(az webapp config ssl list -g nest-rg --query "[?subjectName=='www.yourdomain.com'].thumbprint" -o tsv)
az webapp config ssl bind \
    --resource-group nest-rg --name <app-name> \
    --certificate-thumbprint $THUMB --ssl-type SNI
```

---

## 8. CI/CD

Easiest path: **GitHub Actions** that builds + pushes to ACR on every push to `main`. Sample workflow at `.github/workflows/azure.yml` (left as a TODO — happy to scaffold on request).

The pattern is:
1. `az login` via OIDC federated credential.
2. `az acr build -r <acr> -t nest:${{ github.sha }} -f Dockerfile.azure .`
3. `az webapp config container set --docker-custom-image-name <acr>.azurecr.io/nest:${{ github.sha }}`.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| `Application Error :( ` page | Container didn't bind to `$PORT` | Confirm `WEBSITES_PORT=8080` in app settings; check logs |
| WebSocket immediately closes | `web_sockets_enabled` is off | `az webapp config set --web-sockets-enabled true …` |
| MongoDB auth failure in logs | Wrong connection string | Re-copy from Cosmos DB → Connection strings; paste full `mongodb://…?ssl=true&...` URL |
| `429 Request rate is large` from Cosmos | 400 RU/s too low | Increase throughput or switch to autoscale (`az cosmosdb mongodb database throughput …`) |
| Google login → redirect loop | App not on HTTPS or wrong redirect URL | `https-only` must be `On`; confirm the public URL has a valid cert |
| Cold start > 10s on B1 | `Always On` is off | `az webapp config set --always-on true …` |
| Image pull fails | ACR credentials not wired | Re-run step in script that sets `docker-registry-server-user/password`, or assign managed identity |

---

## 10. Cost & cleanup

Tear it all down with one command:
```bash
az group delete -n nest-rg --yes --no-wait
```

That deletes the resource group and **all** resources inside it (Cosmos DB, App Service, ACR, plan).

---

You're live. 🚀

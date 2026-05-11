#!/usr/bin/env bash
# Nest — Azure deployment helper
#
# Creates a complete Azure stack and deploys Nest as a single Web App for Containers
# fronted by a managed Cosmos DB (MongoDB API).
#
# Prerequisites:
#   - Azure CLI installed and logged in (`az login`)
#   - Docker installed locally
#   - Run from the repo root
#
# Usage:
#   ./deploy/azure/deploy.sh
#
# All names are configurable via env vars; defaults shown below.

set -euo pipefail

# -------- Configuration --------
RG="${AZ_RG:-nest-rg}"
LOCATION="${AZ_LOCATION:-australiaeast}"
ACR="${AZ_ACR:-nestacr$RANDOM}"            # must be globally unique
PLAN="${AZ_PLAN:-nest-plan}"
APP="${AZ_APP:-nest-app-$RANDOM}"          # must be globally unique
COSMOS="${AZ_COSMOS:-nest-cosmos-$RANDOM}" # must be globally unique
DB_NAME="${AZ_DB_NAME:-nest}"
SKU_APP="${AZ_SKU_APP:-B1}"                # B1 = ~AUD 20/mo, supports always-on + WS
IMAGE_TAG="${IMAGE_TAG:-nest:$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"

echo "▶ Resource Group: $RG ($LOCATION)"
echo "▶ ACR:            $ACR"
echo "▶ App Service:    $APP ($SKU_APP)"
echo "▶ Cosmos DB:      $COSMOS"
echo

# -------- 1. Resource group --------
az group create -n "$RG" -l "$LOCATION" -o none

# -------- 2. Container Registry --------
az acr create -n "$ACR" -g "$RG" --sku Basic --admin-enabled true -o none
ACR_LOGIN_SERVER=$(az acr show -n "$ACR" --query loginServer -o tsv)
echo "✔ ACR ready: $ACR_LOGIN_SERVER"

# -------- 3. Build & push image (via ACR — no local docker needed) --------
echo "▶ Building image in ACR (this takes a few minutes)…"
az acr build \
    --registry "$ACR" \
    --image "$IMAGE_TAG" \
    --file Dockerfile.azure \
    . \
    -o none
echo "✔ Image built: $ACR_LOGIN_SERVER/$IMAGE_TAG"

# -------- 4. Cosmos DB for MongoDB (free tier when available) --------
echo "▶ Creating Cosmos DB account (this takes ~5 minutes)…"
az cosmosdb create \
    -n "$COSMOS" \
    -g "$RG" \
    --kind MongoDB \
    --server-version 4.2 \
    --default-consistency-level Session \
    --locations "regionName=$LOCATION failoverPriority=0 isZoneRedundant=False" \
    -o none

# Get connection string
MONGO_URL=$(az cosmosdb keys list -n "$COSMOS" -g "$RG" --type connection-strings \
    --query "connectionStrings[0].connectionString" -o tsv)

# Create the database (with shared throughput) so writes succeed first time
az cosmosdb mongodb database create \
    -a "$COSMOS" -g "$RG" -n "$DB_NAME" \
    --throughput 400 \
    -o none
echo "✔ Cosmos DB ready"

# -------- 5. App Service Plan (Linux) --------
az appservice plan create \
    -n "$PLAN" -g "$RG" --is-linux --sku "$SKU_APP" \
    -o none

# -------- 6. Web App for Containers --------
az webapp create \
    -n "$APP" -g "$RG" -p "$PLAN" \
    --deployment-container-image-name "$ACR_LOGIN_SERVER/$IMAGE_TAG" \
    -o none

# Hook up ACR pull (managed-identity-free)
ACR_USER=$(az acr credential show -n "$ACR" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$ACR" --query 'passwords[0].value' -o tsv)
az webapp config container set \
    -n "$APP" -g "$RG" \
    --docker-custom-image-name "$ACR_LOGIN_SERVER/$IMAGE_TAG" \
    --docker-registry-server-url "https://$ACR_LOGIN_SERVER" \
    --docker-registry-server-user "$ACR_USER" \
    --docker-registry-server-password "$ACR_PASS" \
    -o none

# -------- 7. App settings (env vars) --------
az webapp config appsettings set -n "$APP" -g "$RG" --settings \
    MONGO_URL="$MONGO_URL" \
    DB_NAME="$DB_NAME" \
    CORS_ORIGINS="*" \
    COOKIE_SECURE="true" \
    COOKIE_SAMESITE="lax" \
    WEBSITES_PORT="8080" \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE="false" \
    -o none

# -------- 8. Enable always-on + WebSockets + HTTPS-only --------
az webapp config set -n "$APP" -g "$RG" \
    --always-on true \
    --web-sockets-enabled true \
    --http20-enabled true \
    -o none
az webapp update -n "$APP" -g "$RG" --https-only true -o none

# -------- 9. Restart and surface URL --------
az webapp restart -n "$APP" -g "$RG" -o none
HOST=$(az webapp show -n "$APP" -g "$RG" --query defaultHostName -o tsv)

cat <<EOF

✅ Done!

   URL: https://$HOST
   Logs (live): az webapp log tail -n $APP -g $RG
   Update image: az acr build -r $ACR -f Dockerfile.azure -t nest:next . && \\
                az webapp config container set -n $APP -g $RG \\
                   --docker-custom-image-name $ACR_LOGIN_SERVER/nest:next

Run again with different env vars to spin up another instance.
EOF

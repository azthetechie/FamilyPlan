# One-time Azure OIDC setup for GitHub Actions

The `azure.yml` workflow uses **OIDC federated credentials** — no client-secret to rotate, no service-principal password stored in GitHub. You do this once.

> Replace `<GH_OWNER>/<GH_REPO>` with your repo (e.g. `acme/nest`) everywhere below.

---

## 1. Pre-reqs

You've already run `./deploy/azure/deploy.sh` (or created the resource group / ACR / Web App by hand). You know these names:

| Name        | Example          |
|-------------|------------------|
| Tenant      | `<TENANT_ID>`    |
| Subscription| `<SUB_ID>`       |
| Resource Group | `nest-rg`     |
| ACR         | `nestacr12345`   |
| Web App     | `nest-app-12345` |

Find your IDs:
```bash
az account show --query "{tenantId:tenantId,subscriptionId:id}" -o table
```

---

## 2. Create the Entra (Azure AD) app + federated credential

```bash
GH_OWNER=<your-github-org-or-user>
GH_REPO=nest
APP_NAME=nest-github-deployer

# Create the app + service principal
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
SP_ID=$(az ad sp create --id "$APP_ID" --query id -o tsv)

# Federated credential for pushes to the `main` branch (works for workflow_dispatch too).
az ad app federated-credential create \
    --id "$APP_ID" \
    --parameters @- <<EOF
{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GH_OWNER}/${GH_REPO}:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF

# Optional: also allow the production environment (uncomment if you use environments)
# az ad app federated-credential create \
#     --id "$APP_ID" \
#     --parameters '{
#       "name": "github-env-prod",
#       "issuer": "https://token.actions.githubusercontent.com",
#       "subject": "repo:'"${GH_OWNER}/${GH_REPO}"':environment:production",
#       "audiences": ["api://AzureADTokenExchange"]
#     }'

echo "AZURE_CLIENT_ID=$APP_ID"
```

---

## 3. Grant the principal access

The deployer only needs to: build images in ACR, update the Web App, restart it.

```bash
SUB_ID=$(az account show --query id -o tsv)

# Push images & start builds in ACR
ACR_ID=$(az acr show -n nestacr12345 -g nest-rg --query id -o tsv)
az role assignment create --assignee "$APP_ID" --role "AcrPush" --scope "$ACR_ID"
az role assignment create --assignee "$APP_ID" --role "Contributor" --scope "$ACR_ID"

# Configure & restart the Web App
WEBAPP_ID=$(az webapp show -n nest-app-12345 -g nest-rg --query id -o tsv)
az role assignment create --assignee "$APP_ID" --role "Contributor" --scope "$WEBAPP_ID"
```

> If you'd rather be coarse-grained, grant `Contributor` on the resource group instead:
> ```bash
> RG_ID=$(az group show -n nest-rg --query id -o tsv)
> az role assignment create --assignee "$APP_ID" --role "Contributor" --scope "$RG_ID"
> ```

---

## 4. Set GitHub repository variables

In GitHub → **Settings → Secrets and variables → Actions → Variables → New repository variable**:

| Variable               | Value                            |
|------------------------|----------------------------------|
| `AZURE_CLIENT_ID`      | the `APP_ID` printed in step 2   |
| `AZURE_TENANT_ID`      | from `az account show`           |
| `AZURE_SUBSCRIPTION_ID`| from `az account show`           |
| `AZURE_RG`             | `nest-rg`                        |
| `AZURE_ACR`            | `nestacr12345` (no `.azurecr.io`)|
| `AZURE_WEBAPP`         | `nest-app-12345`                 |

> These are **Variables**, not Secrets — they're not sensitive. The actual auth uses the short-lived OIDC token GitHub Actions mints at runtime.

---

## 5. Trigger your first deploy

```bash
git commit --allow-empty -m "chore: trigger first Azure deploy"
git push origin main
```

Watch progress in the **Actions** tab of your repo. On success, the workflow summary prints `https://<your-app>.azurewebsites.net`.

---

## 6. Rolling back

Every successful deploy tags the image with the commit SHA in ACR. To roll back:

```bash
az webapp config container set \
    -n nest-app-12345 -g nest-rg \
    --docker-custom-image-name "nestacr12345.azurecr.io/nest:<previous-sha>"
az webapp restart -n nest-app-12345 -g nest-rg
```

Or run the workflow again from an older commit via **Actions → Deploy to Azure Web App → Run workflow** with the chosen branch/tag.

---

That's it — every push to `main` will build a new image and roll it out automatically.

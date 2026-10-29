#!/bin/bash
# Usage: scripts/set-secrets.sh <project-name>
# Uploads every value in .secrets/ to Cloudflare Pages secrets for production and preview. Never prints values.
# One value per file (chmod 600), file name -> secret name:
#   session_secret SESSION_SECRET | dash_passphrase DASH_PASSPHRASE
#   sonarr_url SONARR_URL | radarr_url RADARR_URL | prowlarr_url PROWLARR_URL
#   sonarr.key SONARR_KEY | radarr.key RADARR_KEY | prowlarr.key PROWLARR_KEY
#   upstream_user UPSTREAM_USER | upstream_pass UPSTREAM_PASS (optional)
#   jf_base JF_BASE | ombi_base OMBI_BASE (optional)
set -e; cd "$(dirname "$0")/.."; P=${1:?project name}
for f in session_secret dash_passphrase sonarr_url radarr_url prowlarr_url sonarr.key radarr.key prowlarr.key upstream_user upstream_pass jf_base ombi_base; do
  [ -s .secrets/$f ] || { echo "skip $f (no file)"; continue; }
  N=$(echo "$f" | tr a-z. A-Z_)
  for e in production preview; do tr -d '\n' < .secrets/$f | npx wrangler pages secret put "$N" --project-name "$P" --env $e >/dev/null 2>&1 && echo "$N set ($e)"; done
done

#!/bin/bash
# Usage: ./make-setup-link.sh production|preview
# Makes a single-use setup token (24h), stores only its SHA-256 in KV, writes the full link to .secrets/setup_link_<env> (chmod 600). Never prints it.
set -e; cd "$(dirname "$0")"; umask 077; E=${1:-production}
if [ "$E" = preview ]; then NS=$(python3 -c "import tomllib;print(tomllib.load(open('wrangler.toml','rb'))['env']['preview']['kv_namespaces'][0]['id'])"); HOST=$(cat .secrets/host_preview)
else NS=$(python3 -c "import tomllib;print(tomllib.load(open('wrangler.toml','rb'))['kv_namespaces'][0]['id'])"); HOST=$(cat .secrets/host_production); fi
T=$(python3 -c "import secrets;print(secrets.token_urlsafe(32))")
REC=$(T="$T" python3 -c "import os,hashlib,json,time;print(json.dumps({'h':hashlib.sha256(os.environ['T'].encode()).hexdigest(),'exp':int(time.time()*1000)+86400000}))")
printf '%s' "$REC" > .secrets/.setup_rec; npx wrangler kv key put setup --path .secrets/.setup_rec --namespace-id "$NS" --remote >/dev/null 2>&1; rm -f .secrets/.setup_rec
printf 'https://%s/setup?t=%s\n' "$HOST" "$T" > .secrets/setup_link_$E; chmod 600 .secrets/setup_link_$E
echo "Setup link written to .secrets/setup_link_$E (valid 24h, single use)"

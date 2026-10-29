# Media center dashboard (Cloudflare Pages template)

A one-screen remote for Sonarr, Radarr and Prowlarr, with links to Jellyfin and Ombi. Static UI in `public/`, server code in `functions/` (Pages Functions). API keys live only in Cloudflare secrets and never reach the browser. Runs on the Cloudflare free plan. Nothing user specific is in the code.

## Required secrets (Pages, set for production and preview)
| Name | What |
|---|---|
| SESSION_SECRET | Random 48+ characters, signs the login cookie |
| DASH_PASSPHRASE | Emergency login, only works until the user picks a password |
| SONARR_URL, RADARR_URL, PROWLARR_URL | Base URL of each app, no trailing slash |
| SONARR_KEY, RADARR_KEY, PROWLARR_KEY | Each app's API key (Settings, General) |
| UPSTREAM_USER, UPSTREAM_PASS | Optional. Basic auth in front of the apps (shared seedboxes often need it) |
| JF_BASE | Optional. Jellyfin web URL. Play buttons stay off without it |
| OMBI_BASE | Optional. Ombi URL. The Family requests link is hidden without it |

KV binding `AUTH`: one namespace for production, a separate one for preview (ids go in `wrangler.toml`). It stores the password hash, session version and cached data.

## Per-user deploy recipe
1. `npx wrangler login` on the user's own Cloudflare account.
2. Pick a project name, e.g. `media-remote-<name>`, and put it in `wrangler.toml` (`name`).
3. `npm i`, then `npx wrangler pages project create <project> --production-branch main`. Note the pages.dev host.
4. `npx wrangler kv namespace create <project>-auth` and `<project>-auth-preview`. Put the ids in `wrangler.toml`.
5. Make `.secrets/` (chmod 700) with one value per file (chmod 600): see `scripts/set-secrets.sh` for file names. Also `host_production` (`<project>.pages.dev`) and `host_preview` (`preview.<project>.pages.dev`), host names only, no https://. Generate random values with `python3 -c "import secrets;print(secrets.token_urlsafe(32))"`.
6. `scripts/set-secrets.sh <project>`. Values are never printed.
7. Preview first: `npx wrangler pages deploy public --project-name <project> --branch preview`. A brand new pages.dev host can take a few minutes before HTTPS answers; retry if the connection fails. Check `/login` loads and `/api/status` and `/api/config` give 401 without a login. Then `./make-setup-link.sh preview`, open the link from `.secrets/setup_link_preview`, choose a test password, and confirm the link gives 403 when reused (allow about a minute, KV deletes take time to spread). Finally clear the test login from preview KV: `npx wrangler kv key delete pw --namespace-id <preview id> --remote`, the same for `ver`, and delete `.secrets/setup_link_preview`.
8. Production: `npx wrangler pages deploy public --project-name <project> --branch main --commit-dirty=true`, then `./make-setup-link.sh production`. The link is written to `.secrets/setup_link_production` and never printed.
9. Hand the setup link to the user privately (a password manager entry or private form), never in chat. They open it within 24 hours and choose a password. Delete the link file after.

## QA before every deploy
`pip install playwright && python3 -m playwright install chromium`, then:
`QA_BASE=https://<your-host> python3 scripts/qa.py` (QA_BASE is optional; it adds the login page check). It must exit 0. Do not deploy on a failure.

## Rollback
Before each change, copy `public` to `public.pre-<change>.bak` and `functions/api/[[path]].js` to `functions.pre-<change>.bak.js`. To roll back, copy them back and redeploy (preview, then main). Cloudflare also keeps every deployment: in the Pages dashboard you can roll back to any earlier one.

## Forgot password
Delete KV keys `pw` and `ver`, run `./make-setup-link.sh production`, and hand over the new link privately.

## Safety
Removing needs a confirm step. `dryRun: true` on writes shows what would happen without changing anything. Only listed actions are proxied to the apps; there is no open pass-through.

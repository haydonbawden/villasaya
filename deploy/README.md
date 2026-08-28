# Deploying Villa Saya

The app ships as a container image and runs on a single VPS behind Caddy.
Pushing to `main` builds, tests, publishes and rolls out automatically.

```
push to main
   ↓
GitHub Actions ── typecheck · tests · build
   ↓
build image → publish to GHCR (tagged with the commit SHA)
   ↓
SSH to the VPS → pull → docker compose up → wait for healthy
   ↓                            ↓
 success                    unhealthy → roll back to the previous image
```

## What runs on the server

| Container | Role |
| --- | --- |
| `app` | The Node server: API and the built web client on one origin. Not published to the host. |
| `caddy` | The only thing listening publicly. Terminates TLS, proxies to `app`, passes WebSocket upgrades through. |

Two volumes matter:

- **`villa_data`** — the SQLite database and uploaded receipts. **This is the
  thing to back up.**
- `caddy_data` — issued certificates, so a restart does not re-request them.

---

## One-time setup

### 1. Bootstrap the server

Installs Docker, opens ports 22/80/443, and writes `/opt/villa-saya/.env` with
freshly generated signing secrets:

```bash
# With a domain (recommended — you get HTTPS automatically):
ssh root@YOUR_SERVER 'APP_DOMAIN=villa.example.com bash -s' \
  < apps/villa-saya/deploy/bootstrap.sh

# Without a domain (plain HTTP on the IP — see the warning below):
ssh root@YOUR_SERVER 'bash -s' < apps/villa-saya/deploy/bootstrap.sh
```

Re-running it is safe: it never overwrites an existing `.env`, because that
would rotate the signing secrets and sign every user out.

### 2. Add the repository secrets

**Settings → Secrets and variables → Actions.** Nothing about the server is
committed to this repository.

| Secret | Required | What it is |
| --- | --- | --- |
| `DEPLOY_HOST` | yes | The server's IP or hostname |
| `DEPLOY_SSH_KEY` | preferred | Private key for the deploy user (whole file, including the header and footer lines) |
| `DEPLOY_SSH_PASSWORD` | fallback | Used only when `DEPLOY_SSH_KEY` is absent |
| `DEPLOY_USER` | no | Defaults to `root` |
| `DEPLOY_PORT` | no | Defaults to `22` |
| `DEPLOY_PATH` | no | Defaults to `/opt/villa-saya` |
| `DEPLOY_KNOWN_HOSTS` | recommended | Output of `ssh-keyscan YOUR_SERVER`. Without it the workflow trusts the host key on first use and logs a warning |
| `DEPLOY_PUBLIC_URL` | no | URL for the post-deploy check. Defaults to `http://DEPLOY_HOST` |

**Use a key, not a password.** To switch:

```bash
ssh-keygen -t ed25519 -f villa-saya-deploy -N '' -C 'villa-saya deploy'
ssh-copy-id -i villa-saya-deploy.pub root@YOUR_SERVER
# Put the contents of `villa-saya-deploy` in DEPLOY_SSH_KEY, then delete both
# local files. Password auth can then be disabled on the server entirely.
```

### 3. Deploy

Push to `main`, or run **Actions → Villa Saya Deploy → Run workflow**.

---

## Day-to-day

**Redeploy** — merge to `main`. Only changes under `apps/villa-saya/**` trigger
it, so the rest of the repository is unaffected.

**Roll back** — Actions → Villa Saya Deploy → Run workflow, and give the
`image_tag` of a known-good build (the first 12 characters of its commit SHA).
It skips the build and re-points the server at that image.

Automatic rollback is already built in: if the new container never reports
healthy, the previous image is brought back before the job fails, so a bad
build does not take the site down.

**Look at it directly:**

```bash
ssh root@YOUR_SERVER
cd /opt/villa-saya
docker compose ps
docker compose logs -f app
grep VILLA_SAYA_IMAGE .env      # which build is live
```

**Back up** — everything that matters is in one volume:

```bash
docker run --rm -v villa-saya_villa_data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/villa-saya-$(date +%F).tar.gz -C /data .
```

Restore by extracting into the same volume with the stack stopped. A cron job
doing this nightly to off-server storage is the minimum worth having — the
SQLite file is the entire business record.

---

## Adding a domain and HTTPS

Until a domain points at the server, the app runs over plain HTTP, which means
session cookies travel unencrypted and `COOKIE_SECURE` must stay off — a
`Secure` cookie is silently dropped over HTTP, and sign-in would fail with
nothing in the logs to explain it. The server logs a warning on every start
while this is the case.

To fix it, point an A record at the server, then:

```bash
ssh root@YOUR_SERVER
cd /opt/villa-saya
sed -i 's|^APP_URL=.*|APP_URL=https://villa.example.com|' .env
sed -i 's|^CADDY_SITE_ADDRESS=.*|CADDY_SITE_ADDRESS=villa.example.com|' .env
sed -i 's|^COOKIE_SECURE=.*|COOKIE_SECURE=true|' .env
docker compose up -d
```

Caddy requests and renews the certificate on its own. `APP_URL` must match the
address people actually use, because invitation links are built from it.

---

## Email

Without `SMTP_URL` in `.env`, invitations are not emailed: the link is written
to the container log and returned to the inviter in the UI to pass on by hand.
That is workable — most villa staff are easier to reach on WhatsApp — but for
self-service joining, set `SMTP_URL` and `MAIL_FROM` and restart.

---

## Hardening worth doing

The bootstrap gets a working server, not a hardened one. Before this holds real
staff data:

- Deploy as a non-root user in the `docker` group rather than `root`.
- Disable SSH password authentication once key auth works.
- Set `DEPLOY_KNOWN_HOSTS` so the deploy authenticates the server.
- Put the domain and HTTPS in place, and turn `COOKIE_SECURE` back on.
- Move backups off the server.

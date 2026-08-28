#!/usr/bin/env bash
# Runs on the VPS, piped in over SSH by the deploy workflow.
#
# Its inputs arrive as exported variables prepended to this script on stdin,
# rather than as command arguments, so the registry token never appears in the
# server's process list or on its disk.
#
#   IMAGE_REF      full image reference to roll out
#   REGISTRY_USER  GHCR username
#   REGISTRY_TOKEN short-lived GHCR token, valid only for this run
#   DEPLOY_PATH    directory holding docker-compose.yml, Caddyfile and .env
set -euo pipefail

: "${IMAGE_REF:?IMAGE_REF is required}"
: "${REGISTRY_USER:?REGISTRY_USER is required}"
: "${REGISTRY_TOKEN:?REGISTRY_TOKEN is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"

cd "$DEPLOY_PATH"

if [ ! -f .env ]; then
  echo "No .env in $DEPLOY_PATH — run deploy/bootstrap.sh on this server before the first deploy." >&2
  exit 1
fi

# What is running now, so a failed rollout can be put back.
PREVIOUS="$(grep -E '^VILLA_SAYA_IMAGE=' .env | cut -d= -f2- || true)"
echo "Currently running: ${PREVIOUS:-nothing}"
echo "Rolling out:       $IMAGE_REF"

echo "$REGISTRY_TOKEN" | docker login ghcr.io -u "$REGISTRY_USER" --password-stdin
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

docker pull "$IMAGE_REF"

# Record the tag so a manual `docker compose up` on the box reproduces exactly
# what was deployed.
set_image() {
  if grep -qE '^VILLA_SAYA_IMAGE=' .env; then
    sed -i "s|^VILLA_SAYA_IMAGE=.*|VILLA_SAYA_IMAGE=$1|" .env
  else
    echo "VILLA_SAYA_IMAGE=$1" >> .env
  fi
}
set_image "$IMAGE_REF"

up_status=0
VILLA_SAYA_IMAGE="$IMAGE_REF" docker compose up -d --remove-orphans || up_status=$?

# Wait for the container's own healthcheck rather than guessing with a sleep.
healthy=0
for _ in $(seq 1 60); do
  container="$(docker compose ps -q app 2>/dev/null || true)"
  if [ -n "$container" ]; then
    state="$(docker inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo starting)"
    [ "$state" = "healthy" ] && { healthy=1; break; }
    [ "$state" = "unhealthy" ] && break
  fi
  sleep 2
done

if [ "$up_status" -ne 0 ] || [ "$healthy" -ne 1 ]; then
  echo "Rollout failed (compose exit $up_status, healthy=$healthy)." >&2
  docker compose logs --tail 50 app >&2 || true
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$IMAGE_REF" ]; then
    echo "Rolling back to $PREVIOUS" >&2
    set_image "$PREVIOUS"
    VILLA_SAYA_IMAGE="$PREVIOUS" docker compose up -d --remove-orphans
    echo "Rolled back. The previous version is serving again." >&2
  else
    echo "No previous image recorded, so there is nothing to roll back to." >&2
  fi
  exit 1
fi

echo "App is healthy on $IMAGE_REF"

# Keep recent images so a rollback has something to return to; drop old ones.
docker image prune -af --filter 'until=168h' >/dev/null 2>&1 || true

#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TOOLS="$ROOT/scripts/deploy-tools.mjs"
CONFIG_FILE="$ROOT/ecosystem.config.js"
export MORY_ENV_FILE="${MORY_ENV_FILE:-$ROOT/.env.production}"
# Resolve before changing cwd. No dotenv file is evaluated as shell code.
export MORY_ENV_FILE="$(node -e 'process.stdout.write(require("node:path").resolve(process.argv[1]))' "$MORY_ENV_FILE")"
MIGRATE=false
case "${1:-}" in
  '') ;;
  --migrate) MIGRATE=true ;;
  --help|-h) printf '%s\n' 'Usage: ./deploy.sh [--migrate]' 'MORY_ENV_FILE=/absolute/path, MORY_APP_NAME=mory (optional)' 'Installs/builds an isolated release, then starts/reloads PM2. Migration is opt-in.'; exit 0 ;;
  *) printf 'Unknown option: %s\n' "$1" >&2; exit 1 ;;
esac
if (( $# > 1 )); then printf 'Only --migrate is supported.\n' >&2; exit 1; fi
for command in node npm pm2 tar; do command -v "$command" >/dev/null || { printf 'Missing command: %s\n' "$command" >&2; exit 1; }; done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<12)){console.error("Need Node.js >=22.12");process.exit(1)}'
node "$TOOLS" check
APP_NAME="$(node "$TOOLS" name)"
mkdir -p "$ROOT/.deploy/releases"
LOCK="$ROOT/.deploy/deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then printf 'Deploy is locked. See docs/run-and-deploy-pm2.md before removing a stale lock.\n' >&2; exit 1; fi
trap 'rmdir "$LOCK"' EXIT
trap 'printf "Deployment failed at line %s; no success was recorded. See PM2 logs/runbook.\n" "$LINENO" >&2' ERR
RELEASE="$ROOT/.deploy/releases/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir "$RELEASE"

printf '%s\n' '--- 1. Prepare release and install locked dependencies ---'
tar -C "$ROOT" --exclude='src/server/db/generated' --exclude='.env' --exclude='.env.*' -cf - \
  package.json package-lock.json next.config.ts tsconfig.json prisma.config.ts eslint.config.mjs tokens.css src public prisma scripts \
  | tar -C "$RELEASE" -xf -
(
  cd "$RELEASE"
  node "$TOOLS" build-exec -- npm ci --include=dev
  node --conditions=react-server --import tsx scripts/deploy-tools.mjs runtime-check
  printf '%s\n' '--- 2. Build Next.js ---'
  node "$TOOLS" build-exec -- npm run build
)
node "$TOOLS" prepare "$RELEASE"
if [[ "$MIGRATE" == true ]]; then
  printf '%s\n' '--- 3. Apply reviewed database migrations (explicit --migrate) ---'
  (cd "$RELEASE" && node "$TOOLS" exec -- npm run db:migrate)
fi

printf '%s\n' '--- 4. Activate release; start or reload PM2 ---'
node "$TOOLS" activate "$RELEASE"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$CONFIG_FILE" --only "$APP_NAME" --update-env
else
  pm2 start "$CONFIG_FILE" --only "$APP_NAME"
fi
node "$TOOLS" health

# Reconcile only this project's named workers. Persistent supervisors prevent cron/restart loops.
ENABLED=" $(node "$TOOLS" workers) "
for kind in auth-mail reminders media privacy; do
  worker="$APP_NAME-$kind"
  if [[ "$ENABLED" == *" $kind "* ]]; then
    if pm2 describe "$worker" >/dev/null 2>&1; then
      pm2 reload "$CONFIG_FILE" --only "$worker" --update-env
    else
      pm2 start "$CONFIG_FILE" --only "$worker"
    fi
  elif pm2 describe "$worker" >/dev/null 2>&1; then
    pm2 delete "$worker"
  fi
done
pm2 save
printf '%s\n' '--- Deployment complete ---'
pm2 status "$APP_NAME"

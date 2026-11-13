#!/usr/bin/env bash
# =============================================================================
#  OLIMP-LIDER — Oracle Cloud Always Free instance bootstrap
#  Yangi/yo'ng'aytirilgan instance'ni to'liq sozlaydi.
#
#  Ishga tushirish:
#    scp deploy/bootstrap.sh ubuntu@<IP>:/tmp/ && ssh ubuntu@<IP> 'sudo bash /tmp/bootstrap.sh'
#
#  Talablar:
#    - Ubuntu 22.04/24.04 (aarch64 yoki x86_64 — ikkalasi ishlaydi)
#    - ichida internet
#    - muhit o'zgaruvchilari (ixtiyoriy, .env.local yo'q bo'lsa kerak):
#        DATABASE_URL, TELEGRAM_BOT_TOKEN, PASSWORD_KEY, JWT_SECRET
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/ubuntu/olimp}"
REPO_URL="${REPO_URL:-https://github.com/olimplider/-olimp-lider.git}"
BRANCH="${BRANCH:-main}"
DOMAIN="${DOMAIN:-olimplider.uz}"
NODE_MAJOR="${NODE_MAJOR:-20}"

log()  { echo -e "\n\033[1;33m==> $*\033[0m"; }
ok()   { echo -e "  \033[0;32m[OK]\033[0m $*"; }
warn() { echo -e "  \033[0;33m[!]\033[0m $*"; }
die()  { echo -e "  \033[0;31m[X]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "root sifatida ishga tushiring: sudo bash bootstrap.sh"

log "1/9 Tizim paketlari"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates unzip gnupg software-properties-common build-essential >/dev/null
ok "asosiy paketlar"

log "2/9 Node.js ${NODE_MAJOR}.x (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\)\..*/\1/')" -lt "$NODE_MAJOR" ]; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs >/dev/null
  ok "Node $(node -v) o'rnatildi"
else
  ok "Node $(node -v) mavjud"
fi

log "3/9 PM2"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2 --silent >/dev/null
  ok "PM2 $(pm2 -v) o'rnatildi"
else
  ok "PM2 mavjud"
fi

log "4/9 Kod (${REPO_URL}@${BRANCH})"
if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch --all --tags --prune
  git -C "$REPO_DIR" reset --hard "origin/${BRANCH}"
  ok "yangilandi: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
else
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  ok "klonlandi: $(git -C "$REPO_DIR" rev-parse --short HEAD)"
fi

log "5/9 npm install (production)"
cd "$REPO_DIR"
npm install --omit=dev --no-audit --no-fund --silent
ok "paketlar o'rnatildi"

log "6/9 .env.local"
ENVF="$REPO_DIR/.env.local"
if [ -f "$ENVF" ]; then
  ok "mavjud (.env.local saqlanadi)"
else
  [ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL berilmagan va .env.local yo'q"
  {
    echo "DATABASE_URL=\"${DATABASE_URL}\""
    [ -n "${DATABASE_URL_UNPOOLED:-}" ] && echo "DATABASE_URL_UNPOOLED=\"${DATABASE_URL_UNPOOLED}\""
    [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && echo "TELEGRAM_BOT_TOKEN=\"${TELEGRAM_BOT_TOKEN}\""
    [ -n "${PASSWORD_KEY:-}" ] && echo "PASSWORD_KEY=\"${PASSWORD_KEY}\""
    echo "JWT_SECRET=\"${JWT_SECRET:-$(head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n')}\""
  } > "$ENVF"
  chmod 600 "$ENVF"
  ok "yaratildi (chmod 600)"
fi

log "7/9 PM2 ecosystem + ishga tushirish"
mkdir -p "$REPO_DIR/logs" "$REPO_DIR/uploads"
if [ -f "$REPO_DIR/deploy/ecosystem.config.cjs" ]; then
  cp "$REPO_DIR/deploy/ecosystem.config.cjs" "$REPO_DIR/ecosystem.config.cjs"
  pm2 delete olimp >/dev/null 2>&1 || true
  pm2 start "$REPO_DIR/ecosystem.config.cjs" --only olimp --update-env
else
  pm2 delete olimp >/dev/null 2>&1 || true
  pm2 start server/index.js --name olimp --cwd "$REPO_DIR" --update-env
fi
pm2 save >/dev/null
pm2 startup systemd -u "$(whoami)" --hp "$HOME" >/dev/null 2>&1 || true
ok "PM2 boshqaruvchi tayyor"

log "8/9 Reverse proxy (Caddy) + SSL"
if apt-cache show caddy >/dev/null 2>&1; then
  apt-get install -y -qq caddy >/dev/null 2>&1 || true
  if command -v caddy >/dev/null 2>&1; then
    mkdir -p /etc/caddy /var/log/caddy
    cat > /etc/caddy/Caddyfile <<CADDY
${DOMAIN}, www.${DOMAIN} {
    encode gzip zstd
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    log {
        output file /var/log/caddy/olimp.log
        format console
    }
}
CADDY
    systemctl enable caddy >/dev/null 2>&1 || true
    systemctl restart caddy >/dev/null 2>&1 || true
    ok "Caddy sozlandi (${DOMAIN}) - Let's Encrypt avtomatik"
  else
    warn "Caddy o'rnatilmadi. Nginx bilan qo'lda sozlang."
  fi
else
  warn "Caddy apt repositoriyasida topilmadi - skip"
fi

log "9/9 Oracle idle-reclaim'dan himoya (keep-alive)"
if [ -f "$REPO_DIR/deploy/keep-alive.sh" ]; then
  mkdir -p /home/ubuntu/.local/bin
  cp "$REPO_DIR/deploy/keep-alive.sh" /home/ubuntu/.local/bin/keep-alive.sh
  # keep-alive.sh cpu-burn.js ni o'z papkasida izlaydi -> birga ko'chiriladi
  cp "$REPO_DIR/deploy/cpu-burn.js" /home/ubuntu/.local/bin/cpu-burn.js
  chmod +x /home/ubuntu/.local/bin/keep-alive.sh
  cat > /home/ubuntu/.local/bin/olimp-keepalive.cron <<'CRON'
# Oracle Always Free idle reclaim himoyasi.
# CPU 95-percentile > 20% saqlanadi (har daqiqada ~25 sekund yuk).
# "net" varianti tarmoq yukini ham oshiradi.
* * * * * /home/ubuntu/.local/bin/keep-alive.sh cpu >> /home/ubuntu/.local/bin/keepalive.log 2>&1
* * * * * /home/ubuntu/.local/bin/keep-alive.sh net >> /home/ubuntu/.local/bin/keepalive.log 2>&1
CRON
  crontab /home/ubuntu/.local/bin/olimp-keepalive.cron 2>/dev/null || true
  ok "keep-alive cron o'rnatildi"
else
  warn "deploy/keep-alive.sh topilmadi - qo'lda qo'ying"
fi

log "Tayyor. Tekshirish:"
cat <<CHECK
  pm2 status
  pm2 logs olimp --lines 30
  curl -s -o /dev/null -w "local  HTTP=%{http_code}\\n" http://127.0.0.1:3000/api/settings
  curl -s -o /dev/null -w "public HTTP=%{http_code}\\n" https://${DOMAIN}/api/settings
CHECK
ok "Bootstrap yakunlandi"

#!/usr/bin/env bash
# =============================================================================
#  OLIMP-LIDER — Oracle Always Free "idle reclaim" himoyasi
#
#  Oracle rasmiy siyosati
#  (docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm):
#
#    "Oracle will deem virtual machine and bare metal compute instances as idle
#     if, during a 7-day period, the following are true:
#       CPU utilization for the 95th percentile is less than 20%
#       Network utilization is less than 20%
#       Memory utilization is less than 20% (applies to A1 shapes only)"
#
#  Uchala shart HAM bajarilishi kerak ("AND" mantiqi). Biz CPU 95-percentile
#  va tarmoq yukini yuqori ushlab turamiz -> instance "idle" deb hisoblanmaydi.
#
#  Ishlatish:
#    keep-alive.sh cpu   -> CPU yuk (95-percentile ni oshiradi)
#    keep-alive.sh net   -> tarmoq yukini oshiradi
#    keep-alive.sh all   -> ikkalasi
#
#  O'rnatish: deploy/bootstrap.sh avtomatik qiladi (cron).
# =============================================================================
set -uo pipefail

DOMAIN="${DOMAIN:-olimplider.uz}"
CPU_SECONDS="${CPU_SECONDS:-25}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- CPU yuk --------------------------------------------------------------
# Alohida .js fayl orqali (Node 24 `node -e` kodini TypeScript deb
# kompilyatsiya qiladi va require() bilan muammo chiqadi).
cpu_load() {
  local burner="$SCRIPT_DIR/cpu-burn.js"
  if [ -f "$burner" ] && command -v node >/dev/null 2>&1; then
    node "$burner" "$CPU_SECONDS" >/dev/null 2>&1 || true
    return
  fi
  # Zaxira variant: sha256sum bilan cheksiz sikl (openssl yo'q bo'lsa)
  local end=$(( $(date +%s) + CPU_SECONDS ))
  local tmp; tmp=$(mktemp)
  head -c 8388608 /dev/urandom > "$tmp" 2>/dev/null || dd if=/dev/zero of="$tmp" bs=1M count=8 2>/dev/null
  while [ "$(date +%s)" -lt "$end" ]; do
    sha256sum "$tmp" >/dev/null 2>&1 || true
  done
  rm -f "$tmp"
}

# --- Tarmoq yuk ----------------------------------------------------------
net_load() {
  local urls=(
    "https://${DOMAIN}/api/settings"
    "https://${DOMAIN}/"
    "https://${DOMAIN}/css/style.css"
    "https://${DOMAIN}/assets/logo-emblem.png"
  )
  for u in "${urls[@]}"; do
    curl -fsS --max-time 20 -o /dev/null "$u" 2>/dev/null || true
  done
  # Qo'shimcha tarmoq yuk
  curl -fsS --max-time 20 -o /dev/null "https://speed.cloudflare.com/__down?bytes=200000" 2>/dev/null || true
}

case "${1:-all}" in
  cpu) cpu_load ;;
  net) net_load ;;
  all) cpu_load; net_load ;;
  *)   echo "Foydalanish: $0 {cpu|net|all}"; exit 1 ;;
esac

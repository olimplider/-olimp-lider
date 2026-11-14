#!/usr/bin/env bash
# =============================================================================
#  OLIMP-LIDER — server tomonidagi kunlik zaxira (cron)
#  Har kuni soat 03:15 da ishga tushadi, zaxira yaratadi va eskirganlarni o'chiredi.
#
#  O'rnatish (bootstrap.sh dan keyin):
#    crontab -e  ->  15 3 * * * /root/olimp/backup.sh >> /root/olimp/logs/backup.log 2>&1
# =============================================================================
set -uo pipefail
cd /root/olimp

echo "--- $(date -Is) zaxira boshlandi ---"
node server/backup.js
RC=$?

if [ $RC -eq 0 ]; then
  echo "--- $(date -Is) zaxira muvaffaqiyatli ---"
  # Telegram bot orqali xabar berish (ixtiyoriy)
  if [ -f /root/olimp/.env.local ] && command -v curl >/dev/null 2>&1; then
    TOKEN=$(grep -oE 'TELEGRAM_BOT_TOKEN="?[^"]*' /root/olimp/.env.local | cut -d'"' -f2 | tr -d ' ')
    CHAT=$(grep -oE 'BACKUP_CHAT_ID="?[^"]*' /root/olimp/.env.local | cut -d'"' -f2 | tr -d ' ')
    if [ -n "${TOKEN:-}" ] && [ -n "${CHAT:-}" ]; then
      SIZE=$(du -sh /root/olimp/backups/* 2>/dev/null | tail -1 | cut -f1)
      curl -sS --max-time 15 -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
        -d chat_id="$CHAT" \
        -d text="✅ Zaxira yaratildi
📅 $(date '+%Y-%m-%d %H:%M')
💾 ${SIZE:-?}" >/dev/null 2>&1 || true
    fi
  fi
else
  echo "--- $(date -Is) zaxira XATO (kod $RC) ---"
fi
exit $RC

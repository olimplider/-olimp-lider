# =============================================================================
#  OLIMP-LIDER — zaxirani serverga tiklash (restore)
#
#  Ishlatish:
#    powershell -File restore-backup.ps1                          # eng oxirgisi
#    powershell -File restore-backup.ps1 -Stamp 2026-11-14_03-15-00
#
#  DIQQAT: Tiklash mavjud ma'lumotlarni ALMASHADI (restore qiladi).
# =============================================================================
param(
  [string]$Stamp = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Server = "root@135.181.151.219"
$Key    = "$env:TEMP\opencode\olimp-key.pem"
$LocalRoot = if ($env:OLIMP_BACKUP_DIR) { $env:OLIMP_BACKUP_DIR } else { "G:\olimp\olimp-backups" }
$RemoteTmp = "/tmp/olimp-restore"

$SSH = "C:\Windows\System32\OpenSSH\ssh.exe"
$SCP = "C:\Windows\System32\OpenSSH\scp.exe"
$opt = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
         "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "LogLevel=ERROR")

function Log([string]$m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

if (-not (Test-Path $Key)) { Write-Error "SSH kalit topilmadi: $Key"; exit 1 }

# --- Zaxirani tanlash ---
$dirs = Get-ChildItem $LocalRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}' } | Sort-Object Name -Descending
if (-not $dirs) { Write-Error "Mahalliy zaxiralar topilmadi: $LocalRoot"; exit 1 }

if ($Stamp) {
  $dir = $dirs | Where-Object { $_.Name -eq $Stamp } | Select-Object -First 1
  if (-not $dir) { Write-Error "Zaxira topilmadi: $Stamp"; exit 1 }
} else {
  $dir = $dirs[0]
}
Log "Tiklash zaxirasi: $($dir.Name)"

$meta = Get-Content (Join-Path $dir.FullName "meta.json") -Raw | ConvertFrom-Json
Log "Yaratilgan: $($meta.createdAt) | o'quvchilar=$($meta.counts.students) | foydalanuvchilar=$($meta.counts.users)"

if ($DryRun) { Log "(DryRun) hech narsa o'zgartirilmadi"; exit 0 }

# --- 1) Serverga yuklash ---
Log "Serverga yuklanmoqda..."
& $SSH @opt $Server "rm -rf $RemoteTmp && mkdir -p $RemoteTmp" 2>$null | Out-Null
& $SCP @opt (Join-Path $dir.FullName "*") "${Server}:$RemoteTmp/" 2>&1 | Out-Null
Log "Yuklandi"

# --- 2) Tiklash ---
$script = @"
set -euo pipefail
cd /root/olimp
echo '--- PM2 to\'xtatilmoqda ---'
pm2 stop olimp || true

echo '--- DB tiklanmoqda ---'
node -e '
const fs=require("fs");const zlib=require("zlib");const {Pool}=require("pg");
require("/root/olimp/server/load-env");
const dump=JSON.parse(zlib.gunzipSync(fs.readFileSync("$RemoteTmp/db.json.gz")).toString("utf8"));
(async()=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
  await pool.query("CREATE TABLE IF NOT EXISTS app_kv (key text PRIMARY KEY, value jsonb NOT NULL)");
  for(const k of Object.keys(dump)){
    await pool.query("INSERT INTO app_kv (key,value) VALUES (\$1,\$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",[k,JSON.stringify(dump[k])]);
  }
  console.log("  " + Object.keys(dump).length + " kolleksiya tiklandi");
  await pool.end();
})().catch(e=>{console.error("DB XATO: "+e.message);process.exit(1)});
'

echo '--- uploads tiklanmoqda ---'
if [ -s "$RemoteTmp/uploads.tar.gz" ]; then
  tar -xzf "$RemoteTmp/uploads.tar.gz" -C /root/olimp && echo "  uploads tiklandi"
else
  echo "  uploads bo'sh (arxiv yo'q)"
fi

echo '--- .env.local tiklanmoqda ---'
if [ -f "$RemoteTmp/env.local.bak" ]; then
  cp "$RemoteTmp/env.local.bak" /root/olimp/.env.local && chmod 600 /root/olimp/.env.local && echo "  env.local tiklandi"
fi

echo '--- PM2 qayta ishga tushirilmoqda ---'
pm2 restart olymp 2>/dev/null || pm2 restart olimp
sleep 6
pm2 list --no-color | grep -i olimp
curl -s -o /dev/null -w '  local HTTP=%{http_code}\n' http://127.0.0.1:3000/api/settings
rm -rf $RemoteTmp
echo '--- TAYYOR ---'
"@

$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
& $SSH @opt $Server "echo $b64 | base64 -d > /tmp/restore.sh && bash /tmp/restore.sh" 2>&1 | Out-String
Log "Tiklash yakunlandi"

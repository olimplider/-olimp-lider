# =============================================================================
#  OLIMP-LIDER — zaxirani kompyuterga tortish (pull)
#  Windows Task Scheduler orqali har kuni avtomatik ishlaydi.
#
#  Ishlash mantiqi:
#    1) Serverda zaxiralar ro'yxatini olamiz
#    2) Eng yangisini (mahalliyda yo'q bo'lsa) tortamiz
#    3) meta.json dagi SHA256 checksumlarni tekshiramiz
#    4) 30 kundan eskirganlarini o'chiramiz
#
#  Qo'lda ishga tushirish:
#    powershell -File pull-backup.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$Server   = "root@135.181.151.219"
$Key      = "$env:TEMP\opencode\olimp-key.pem"
$RemoteRoot = "/root/olimp/backups"
$LocalRoot = if ($env:OLIMP_BACKUP_DIR) { $env:OLIMP_BACKUP_DIR } else { "G:\olimp\olimp-backups" }
$KeepDays = 30

$SSH = "C:\Windows\System32\OpenSSH\ssh.exe"
$SCP = "C:\Windows\System32\OpenSSH\scp.exe"
$opt = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
         "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "LogLevel=ERROR")

function Log([string]$m) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
  Write-Host $line
  Add-Content -Path (Join-Path $LocalRoot "pull.log") -Value $line -ErrorAction SilentlyContinue
}

if (-not (Test-Path $Key)) { Write-Error "SSH kalit topilmadi: $Key"; exit 1 }
New-Item -ItemType Directory -Path $LocalRoot -Force | Out-Null

# --- 1) Serverdagi zaxiralar ---
$list = & $SSH @opt $Server "ls -1 $RemoteRoot 2>/dev/null | grep -E '^[0-9]{4}-' | sort -r" 2>$null | Out-String
$names = ($list -split "`r?`n" | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}' }) | Sort-Object -Descending
if (-not $names) { Log "SERVERDA ZAXIRA YO'Q"; exit 1 }
Log "Serverda zaxiralar: $($names.Count) ta, eng yangisi: $($names[0])"

# --- 2) Allaqachon tortilganmi ---
$target = $null
foreach ($n in $names) {
  if (-not (Test-Path (Join-Path $LocalRoot $n))) { $target = $n; break }
}
if (-not $target) {
  Log "Barcha zaxiralar allaqachon mahalliyda. Chiqish."
  exit 0
}
Log "Tortilmoqda: $target"

# --- 3) scp bilan tortish ---
$dest = Join-Path $LocalRoot $target
$out = & $SCP @opt -r "${Server}:$RemoteRoot/$target" $LocalRoot 2>&1 | Out-String
if (-not (Test-Path $dest)) {
  Log "XATO: tayyorlanmadi! $out"
  exit 1
}
Log "Tortildi: $target"

# --- 4) Checksum tekshiruv ---
$metaFile = Join-Path $dest "meta.json"
if (Test-Path $metaFile) {
  $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
  $ok = $true
  foreach ($f in $meta.files) {
    $p = Join-Path $dest $f.name
    if (-not (Test-Path $p)) { Log "  ❌ yo'q: $($f.name)"; $ok = $false; continue }
    $h = (Get-FileHash $p -Algorithm SHA256).Hash.ToLower()
    if ($h -eq $f.sha256) {
      Log "  ✅ $($f.name) ($([math]::Round($f.size/1MB,2)) MB) — checksum mos"
    } else {
      Log "  ❌ $($f.name) — checksum MOS EMAS!"
      $ok = $false
    }
  }
  $students = if ($meta.counts.PSObject.Properties['students']) { $meta.counts.students } else { '?' }
  $users    = if ($meta.counts.PSObject.Properties['users'])    { $meta.counts.users }    else { '?' }
  Log "  DB: o'quvchilar=$students, foydalanuvchilar=$users, yaratilgan=$($meta.createdAt)"
  if (-not $ok) { Log "CHECKSUM XATO — zaxira buzilgan"; exit 1 }
} else {
  Log "⚠️ meta.json topilmadi — tekshiruv o'tkazilmadi"
}

# --- 5) Eskirganlarni o'chirish ---
$cutoff = (Get-Date).AddDays(-$KeepDays)
$removed = 0
Get-ChildItem $LocalRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match '^\d{4}-\d{2}-\d{2}_' -and $_.CreationTime -lt $cutoff
} | ForEach-Object {
  Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
  $removed++
}
if ($removed -gt 0) { Log "Eski zaxiralar o'chirildi: $removed" }

$total = (Get-ChildItem $LocalRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
Log "=== TAYYOR === | jami mahalliy: $([math]::Round($total/1MB,2)) MB | $KeepDays kun saqlanadi"

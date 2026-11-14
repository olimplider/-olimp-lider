# =============================================================================
#  OLIMP-LIDER — zaxirani kompyuterga tortish (pull)
#  Windows Task Scheduler orqali har kuni avtomatik ishlaydi.
#
#  MANTIQ:
#    1) Serverdagi zaxiralar ro'yxatini olamiz
#    2) Eng yangisini (mahalliyda yo'q bo'lsa) tortamiz
#    3) meta.json dagi SHA256 checksumlarni tekshiramiz
#    4) 30 kundan eskirganlarni o'chiramiz
#    5) Mirror papkalariga (USB va h.k.) nusxa qilamiz
#
#  JOY:
#    Asosiy  : C:\olimp-backups        (doimiy disk - har doim mavjud)
#    Mirror  : G:\olimp\olimp-backups   (USB - ulangan bo'lsa nusxa)
#
#  Task Scheduler SYSTEM hisobida ishlaydi, shuning uchun:
#    - SSH kalit C:\olimp-keys\ da bo'lishi SHART (removable diskda emas)
#    - G: (USB) nusxa qilish ixtiyoriy, xato bo'lsa o'tkazib yuboriladi
# =============================================================================
$ErrorActionPreference = "Continue"

$Server     = "root@135.181.151.219"
$RemoteRoot = "/root/olimp/backups"
$LocalRoot  = if ($env:OLIMP_BACKUP_DIR) { $env:OLIMP_BACKUP_DIR } else { "C:\olimp-backups" }
$MirrorDirs = @("G:\olimp\olimp-backups")
$KeepDays   = 30

# SSH kalit bir necha joyda bo'lishi mumkin (Task Scheduler SYSTEM hisobida
# %TEMP% boshqa bo'ladi, removable disk esa ko'rinmaydi)
$KeyCandidates = @(
  "C:\olimp-keys\olimp-key.pem",
  "G:\olimp\keys\olimp-key.pem",
  "$env:TEMP\opencode\olimp-key.pem",
  "C:\Users\SHAHZODBEK\AppData\Local\Temp\opencode\olimp-key.pem"
)
$Key = $null
foreach ($k in $KeyCandidates) { if (Test-Path $k) { $Key = $k; break } }

$SSH = "C:\Windows\System32\OpenSSH\ssh.exe"
$SCP = "C:\Windows\System32\OpenSSH\scp.exe"
# Umumiy ssh/scp sozlamalari
$optCommon = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
                "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "LogLevel=ERROR",
                "-o", "StdinNull=yes", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3")
# ssh uchun qo'shimcha: -n (stdin /dev/null) va -T (pseudo-terminal yo'q)
# SYSTEM ostida ssh.exe konsolga yozishga urilib osilib qoladi -> bu muhim.
$optSsh = $optCommon + @("-n", "-T")
# scp uchun minimal option set (-n/-T va qo'shimcha -o parametrlar scp'ni buzadi)
$optScp = @("-i", $Key, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=NUL",
              "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "-o", "LogLevel=ERROR")

function Log([string]$m) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
  Write-Host $line
  try { Add-Content -Path (Join-Path $LocalRoot "pull.log") -Value $line -ErrorAction SilentlyContinue } catch {}
}

# --- Xavfsiz ishga tushirish (timeout bilan) ---
# ssh/scpe osilib qolsa task butunlay to'xtab qolmasligi uchun
function Run-Exe([string]$exe, [string[]]$exeArgs, [int]$timeoutSec = 180) {
  $outF = Join-Path $env:TEMP "olimp_exe_out.txt"
  $errF = Join-Path $env:TEMP "olimp_exe_err.txt"
  try {
    $p = Start-Process -FilePath $exe -ArgumentList $exeArgs -NoNewWindow -PassThru `
          -RedirectStandardOutput $outF -RedirectStandardError $errF
    if (-not $p.WaitForExit($timeoutSec * 1000)) {
      try { $p.Kill() } catch {}
      return @{ out = ""; err = "TIMEOUT ($timeoutSec s)"; code = -1 }
    }
    $p.Refresh()
    $o = (Get-Content $outF -Raw -ErrorAction SilentlyContinue)
    $e = (Get-Content $errF -Raw -ErrorAction SilentlyContinue)
    return @{ out = $o; err = $e; code = $p.ExitCode }
  } catch {
    return @{ out = ""; err = $_.Exception.Message; code = -1 }
  }
}

if (-not $Key) {
  Log "XATO: SSH kalit topilmadi. Quyidagilardan biri kerak:"
  foreach ($k in $KeyCandidates) { Log "   - $k" }
  exit 1
}
New-Item -ItemType Directory -Path $LocalRoot -Force | Out-Null
Log "Kalit: $Key | Asosiy papka: $LocalRoot"

# --- 1) Serverdagi zaxiralar ---
$r1 = Run-Exe $SSH (@($optSsh + @($Server, "ls -1 $RemoteRoot 2>/dev/null | grep -E '^[0-9]{4}-' | sort -r"))) 90
$list = $r1.out
if (-not $list) { Log "SSH xato: $($r1.err)"; exit 1 }
$names = ($list -split "`r?`n" | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}' }) | Sort-Object -Descending
if (-not $names) { Log "SERVERDA ZAXIRA YO'Q"; exit 1 }
Log "Serverda zaxiralar: $($names.Count) ta, eng yangisi: $($names[0])"

# --- 2) Allaqachon tortilganmi ---
$target = $null
foreach ($n in $names) { if (-not (Test-Path (Join-Path $LocalRoot $n))) { $target = $n; break } }
if (-not $target) { Log "Barcha zaxiralar allaqachon mahalliyda. Chiqish."; exit 0 }
Log "Tortilmoqda: $target"

# --- 3) scp bilan tortish ---
$dest = Join-Path $LocalRoot $target
$r2 = Run-Exe $SCP (@($optScp + @("-r", "${Server}:$RemoteRoot/$target", $LocalRoot))) 600
if (-not (Test-Path $dest)) { Log "XATO: tayyorlanmadi! $($r2.err)"; exit 1 }
Log "Tortildi: $target"

# --- 4) Checksum tekshiruv ---
$metaFile = Join-Path $dest "meta.json"
if (Test-Path $metaFile) {
  $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
  $ok = $true
  foreach ($f in $meta.files) {
    $p = Join-Path $dest $f.name
    if (-not (Test-Path $p)) { Log "  XATO yo'q: $($f.name)"; $ok = $false; continue }
    $h = (Get-FileHash $p -Algorithm SHA256).Hash.ToLower()
    if ($h -eq $f.sha256) { Log "  OK $($f.name) ($([math]::Round($f.size/1KB,1)) KB) - checksum mos" }
    else { Log "  XATO $($f.name) - checksum MOS EMAS!"; $ok = $false }
  }
  $students = if ($meta.counts.PSObject.Properties['students']) { $meta.counts.students } else { '?' }
  $users    = if ($meta.counts.PSObject.Properties['users'])    { $meta.counts.users }    else { '?' }
  Log "  DB: o'quvchilar=$students, foydalanuvchilar=$users, yaratilgan=$($meta.createdAt)"
  if (-not $ok) { Log "CHECKSUM XATO - zaxira buzilgan"; exit 1 }
} else { Log "ogohlantirish: meta.json topilmadi" }

# --- 5) Eskirganlarni o'chirish ---
$cutoff = (Get-Date).AddDays(-$KeepDays)
$removed = 0
Get-ChildItem $LocalRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -match '^\d{4}-\d{2}-\d{2}_' -and $_.CreationTime -lt $cutoff
} | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue; $removed++ }
if ($removed -gt 0) { Log "Eski zaxiralar o'chirildi: $removed" }

# --- 6) Mirror (USB va h.k.) ---
foreach ($m in $MirrorDirs) {
  try {
    if (-not (Test-Path $m)) { New-Item -ItemType Directory -Path $m -Force | Out-Null }
    Copy-Item -Path (Join-Path $LocalRoot $target) -Destination $m -Recurse -Force -ErrorAction Stop
    Log "Nusxa: $m"
  } catch { Log "Nusxa o'tkazilmadi ($m) - xato: $($_.Exception.Message.Split([char]10)[0])" }
}

$total = (Get-ChildItem $LocalRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum
Log "=== TAYYOR === | jami: $([math]::Round($total/1MB,2)) MB | $KeepDays kun saqlanadi | $LocalRoot"

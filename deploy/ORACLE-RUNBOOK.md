# OLIMP-LIDER — Oracle Cloud Always Free Runbook

Oracle Cloud'da joylashgan production muhiti uchun to'liq qo'llanma.

---

## 1. Arxitektura

```
olimplider.uz (DNS: ns1/ns2.pscloud.uz)
      │
      └─ A record → <Oracle instance IP>
                   └─ VM.Standard.A1.Flex (2 OCPU / 12 GB) — Always Free
                      Ubuntu 24.04 (aarch64)
                      ├─ Caddy  →  SSL (Let's Encrypt, avtomatik)
                      ├─ PM2    →  node server/index.js  (port 3000, app "olimp")
                      ├─ keep-alive cron → Oracle idle-reclaim himoyasi
                      └─ .env.local → maxfiy kalitlar (git'da yo'q)

Ma'lumotlar bazasi: Neon PostgreSQL (eu-central-1) — serverda emas, bulutda
Telegram bot: @OLIMLIDER_BOT (token .env.local da)
```

> Render (`olimplider.onrender.com`) — **bo'sh ketilgan**, ishlatilmaydi.
> GitHub Actions `keep-alive` ham endi faqat haqiqiy hostga ping qiladi.

---

## 2. Oracle Always Free limitlari (rasmiy hujjat)

Manba: `docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm`

| Resurs | Doimiy bepul |
|---|---|
| `VM.Standard.A1.Flex` (Arm) | **1,500 OCPU-soat + 9,000 GB-soat / oy** = **2 OCPU + 12 GB** doimiy |
| `VM.Standard.E2.1.Micro` (AMD) | **2 ta** (har biri 1/8 OCPU, 1 GB RAM) |
| Block Volume | 200 GB (jami) |
| Object Storage | 20 GB |

> **Eslatma:** 1 OCPU × 24 soat × 30 kun = 720 OCPU-soat.
> 2 OCPU × 720 soat = **1,440 OCPU-soat** ✅ (limit 1,500)
> 12 GB × 720 soat = **8,640 GB-soat** ✅ (limit 9,000)
> Ya'ni **A1 2 OCPU / 12 GB 24/7 ishlab turishi to'liq bepul.**

### ⚠️ Idle reclaim (asosiy xavf)

> "Oracle will deem virtual machine and bare metal compute instances as idle
> if, during a 7-day period, the following are true:
> • CPU utilization for the **95th percentile** is less than 20%
> • Network utilization is less than 20%
> • Memory utilization is less than 20% (**applies to A1 shapes only**)"

**Uchala shart ham** bajarilishi kerak. Biz `deploy/keep-alive.sh` orqali
CPU 95-percentile va tarmoq yukini yuqori ushlab turamiz → instance
"idle" deb hisoblanmaydi.

> Eski keep-alive `olimplider.onrender.com` ga ping qilardi — **haqiqiy
> Oracle instance trafik olmaydi** edi. Shu sabab provider uni reclaim qilib
> yuborgan. Endi tuzatildi (`bbb7013`).

---

## 3. Instance yaratish (yo'ng'aytirilgan bo'lsa)

Oracle Console → Compute → Instances → **Create instance**

| Sozma | Qiymat |
|---|---|
| Shape | `VM.Standard.A1.Flex` — **2 OCPU, 12 GB RAM** |
| OS | Ubuntu 24.04 (aarch64) — *yoki* 22.04 |
| AD | Frankfurt: **1 ta** (A1 barcha AD larda, faqat 1 ta bo'lsa) |
| Boot volume | **50 GB** (Always Free 200 GB dan) |
| Networking | **Public subnet**, **Reserved Public IP** tanlang |
| SSH | `ubuntu` kaliti bilan (mavjud `olimp-key.pem`) |

**Muhim:** *Reserved Public IP* tanlang — keyin instance qayta yaratilsa ham
IP o'zgarmaydi, DNS'ni o'zgartirish shart emas.

### Yaratilgandan keyin (3 ta buyruq)

```bash
# 1) .env.local yuklash (maxfiy kalitlar — lokal nusxadan)
scp "G:\olimp\maktab-sistemasi\.env.local" ubuntu@<IP>:/home/ubuntu/olimp/.env.local

# 2) Bootstrap
scp "G:\olimp\maktab-sistemasi\deploy\bootstrap.sh" ubuntu@<IP>:/tmp/
ssh ubuntu@<IP> "sudo bash /tmp/bootstrap.sh"

# 3) Tekshiruv
ssh ubuntu@<IP> "pm2 status; curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/settings"
```

> **cloud-init variant:** Instance yaratishda *Advanced options → User data* ga
> `deploy/cloud-init.yaml` matnini yopishtiring — instance o'z-o'zidan
> sozlanadi. `.env.local` ni baribir alohida yuklash kerak.

---

## 4. Oddiy deploy (dizayn/kod yangilash)

```powershell
powershell -File "$env:TEMP\opencode\deploy-olimp.ps1"
```

Skript: zaxira → scp (9 fayl) → MD5 taqqoslash → `pm2 restart` → public tekshiruv.

---

## 5. Tez-tez uchraydigan muammolar

| Belgi | Sabab | Yechim |
|---|---|---|
| Ping 100% yo'qotish, portlar yopiq | Instance to'xtatilgan/reclaim | Console → **Start** yoki qayta yaratish |
| "Out of host capacity" | Frankfurt'da A1 yo'q | Boshqa AD, keyin qayta urinish |
| IP o'zgardi | Yangi instance | DNS A record'ni yangilash (yoki Reserved IP'dan foydalanish) |
| Sayt 502 | PM2 o'lgan | `pm2 restart olimp && pm2 logs olimp` |
| SSL xatosi | Caddy Let's Encrypt ololmadi | `caddy logs` — DNS A record to'g'ri ekanini tekshirish |
| Eski token ishlamaydi | JWT_SECRET o'zgardi | Foydalanuvchi qayta kiritadi (xavfsiz) |

---

## 6. Fayllar

| Fayl | Vazifa |
|---|---|
| `deploy/bootstrap.sh` | Yangi instance'ni to'liq sozlaydi |
| `deploy/keep-alive.sh` | Oracle idle-reclaim himoyasi (CPU + tarmoq) |
| `deploy/ecosystem.config.cjs` | PM2 sozlamalari |
| `deploy/cloud-init.yaml` | Oracle Console user-data |
| `.github/workflows/keep-alive.yml` | GitHub Actions → haqiqiy hostga ping |

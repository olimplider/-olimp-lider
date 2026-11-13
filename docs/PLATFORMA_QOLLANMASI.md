# OLIMP-LIDER — Platforma foydalanish qo'llanmasi

> Maxsus harbiy sport klubi boshqaruv tizimi
> Versiya: 1.0 · yangilangan: 2026-yil 12-noyabr · Telegram bot: **@OLIMLIDER_BOT**

---

## 1. Kirish

### 1.1. Sayt manzili

| Sahifa | Manzil |
|---|---|
| Barcha uchun asosiy kirish | **https://olimplider.uz** |
| Login sahifasi (maxfiy) | `/site?.k7m2q9?x4p8r` |

Asosiy manzil (`https://olimplider.uz`) **login sahifasini** ochadi. Panel sahifalari maxfiy — ularga faqat login qilingandan keyin yo'naltiriladi.

### 1.2. Rollar va kirish

| Rol | Kim uchun | Panel |
|---|---|---|
| **Super admin** (`admin`) | Barcha filiallarni boshqaradi | Boshqaruv paneli |
| **Filial admin** | Bitta filialni boshqaradi | Filial paneli |
| **O'qituvchi** | O'z sinflarini boshqaradi | O'qituvchi paneli |
| **Shifokor** | Tibbiy nazorat | Shifokor paneli |
| **Ota-ona** | Farzandini kuzatadi | Ota-ona paneli |

**Kirish:** login va parolni kiriting. Tizim rolingizga qarab avtomatik to'g'ri panelga yo'naltiradi. Panel sarlavhasida sizning **filial nomingiz** ko'rsatiladi.

### 1.3. Eslatma

> 🔒 Barcha panel sahifalari maxfiy manzilda beriladi. Bu manzillarni ota-onalar yoki o'qituvchilar bilan bo'lishish **mumkin** — ular o'z ma'lumotlarini faqat ko'rishlari uchun.

---

## 2. Super admin paneli (Boshqaruv paneli)

Super admin **barcha filiallarni** boshqaradi: har biri o'z o'quvchilari, o'qituvchilari, shifokorlari va to'lovlarini ko'radi.

### 2.1. Dashbord

Birinchi ochiladigan sahifa. Ko'rsatadi:
- **Bugun keldi** / **Bugun kelmadi** / **Belgilanmagan**
- **Bu oy to'ladi** / **To'lanmagan**
- **O'rtacha baho**
- Jami o'quvchilar soni

Statistikani **o'z filalingiz** bo'yicha ko'rsatadi. Yuqoridagi **"Yangilash"** tugmasi ma'lumotlarni qayta yuklaydi.

---

### 2.2. 📁 Filiallar boshqaruvi

**Filial** — butun bir maktab. Har bir filialning o'z o'quvchilari, o'qituvchilari, shifokorlari va to'lovlari bor. **Filial ma'lumotlari bir-biriga aralashmaydi.**

#### Yangi filial qo'shish

1. **Filiallar** bo'limiga o'ting → **"+ Filial qo'shish"**
2. To'ldiring:
   - **Filial nomi** * (masalan: 168-maktab)
   - Maktab raqami
   - Manzil
   - Telefon
3. **Filial admini** qismida **login** va **parol** kiriting
   > 🔑 Bu majburiy. Filial qo'shilishi bilan **birga filial admini yaratiladi** va shu filialga biriktiriladi. Admin faqat o'z filialini ko'radi.

#### Filialni tahrirlash

**"Tahrirlash"** tugmasi orqali:
- Nomi, raqami, manzili, telefoni o'zgartiriladi
- **Filial admini (mavjud)** — ro'yxatdan tanlanadi va shu filialga biriktiriladi
- **Yetim filial admini** — agar avval filial o'chirilgan bo'lsa, admin "filialsiz" qolgan. Bu yerda tanlab, qayta biriktirasiz
- **Yangi filial admini** — login + parol kiritib, yangisini yaratish mumkin

#### Boshqa filiallar

| Ustun | Ma'nosi |
|---|---|
| Filial nomi | Maktab nomi |
| **Admin** | Shu filialning mas'ul admini (yoksa `Admin yo'q` badge'i) |
| O'quvchilar / O'qituvchilar / Shifokorlar | Shu filialdagi yozuvlar soni |
| Holat | Faol / No'faol |
| Amallar | **Statistika** · Tahrirlash · O'chirish |

**"Statistika"** — o'quvchi, o'qituvchi, shifokor va to'lovlar soni.

**Filialni o'chirish** faqat filial **butunlay bo'sh** bo'lsa mumkin (o'quvchi/o'qituvchi/shifokor/tolov yo'q). Fikr: avval ma'lumotlarni boshqa filialga ko'chiring.

---

### 2.3. 🎓 O'quvchilar

#### Yangi o'quvchi qo'shish

**"+ O'quvchi qo'shish"** → forma:

| Maydon | Izoh |
|---|---|
| Familya, Ism | Majburiy |
| Otasining ismi, Sinf | |
| Tug'ilgan sana, Oylik to'lov | |
| Manzil, Ota-ona ismi, Ota-ona telefoni | |
| **Filial** | Super admin uchun — qaysi maktabga tegishli |
| Ota-ona logini va paroli | Avtomatik yaratiladi, o'zgartirsa bo'ladi |

Saqlangach **"Ota-ona kirishi yaratildi"** oynasi ochiladi — undan **login, parol va Telegram havolasini** nusxalab, ota-onaga bering.

> 👨‍👩‍👧 **Bitta ota-onaning bir nechta farzandi bo'lsa**, ikkinchi farzandni qo'shganingizda **yangi login yaratilmaydi** — ota-onaning eski logini ikkinchi farzandga ham ulanadi. Telegram havolasi ham **bitta** bo'lib qoladi.

#### 📥 Excel/CSV orqali import

Ko'p o'quvchilarni bir vaqtda yuklash uchun.

**1. Shablon:** **"📥 Import (Excel/CSV)"** → **"📄 Shablon faylni yuklab olish"** (`oquvchilar_shabloni.xlsx`)

**2. Faylni tayyorlang** — ustun nomlari:

| Ustun | Talab | Misol |
|---|---|---|
| **Familya** | ✅ majburiy | Valiyev |
| **Ism** | ✅ majburiy | Ali |
| Otasining ismi | | Valiyevich |
| Sinf | | 5-A |
| Tug'ilgan sana | | `2013-04-12` · `12.04.2013` · Excel sanasi |
| Oylik to'lov | | `500000` yoki `500 000` |
| Ota-ona ismi | | Karim Valiyev |
| Ota-ona telefoni | | +998901234567 |

> 🌐 Ustun nomlari **o'zbekcha, ruscha yoki inglizcha** bo'lishi mumkin: `Familya/Фамилия/Lastname`, `Ism/Имя/Firstname`, `Sinf/Класс/Class`, `Tug'ilgan sana/Дата рождения`, `Oylik to'lov/Сумма/Payment`, `Ota-ona/Родитель`, `Telefon/Телефон`.
> 📎 Formatlar: `.xlsx`, `.csv`. Ajratuvchi avtomatik aniqlanadi (`,` `;` `Tab`). UTF-8 va BOM qo'llab-quvvatlanadi.

**3. Yuklang** → **"Tahlil qilish"**:
- Necha qator topilgani, ogohlantirishlar (telefon shakli, sana noaniq) ko'rsatiladi
- Jadval ko'rinishida 50 ta qatorgacha

**4. Filialni tanlang** → **"Yuklash"** → natijada login va parollar chiqadi.

> ⚠️ Import **avval ko'rib chiqiladi**, hech narsa darhol yozilmaydi. Tasdiqlashdan keyin yoziladi.

#### 🏫 Filialga ko'chirish

1. Jadvalda kerakli o'quvchilarni **checkbox** bilan belgiring (sarjadagi katakcha — hammasini)
2. Yuqorida chiqadigan **"🏫 Filialga ko'chirish"** tugmasi
3. Maqsad filiallni tanlang → tasdiqlang

**Natija:** o'quvchi va uning **ota-ona hisobi** yangi filialga o'tadi. Agar ota-ona Telegram'ga ulangan bo'lsa, **"Farzandingiz ko'chirildi"** xabari yuboriladi.

#### Ko'p tanlash (umumiy)

Jadval chapidagi checkbox'lar bilan bir nechta yozuvni belgilab, yuqoridagi panel tugmalarini ishlatish mumkin.

---

### 2.4. 💰 Oylik to'lovlar

**Oylar va yillar** yuqoridagi tanlovchilar orqali almashtiriladi.

- Jadvalda har bir o'quvchi uchun **tugma (switch)** — bosingda holat darhol o'zgaradi
- Holat ustuni: **To'langan** (yashil) / **To'lanmagan** (qizil)
- Progress bar: oy bo'yicha to'lov holati

**Ommaviy belgilash:**
1. Kerakli o'quvchilarni **checkbox** bilan belgiling
2. **"✓ To'langan qilish"** yoki **"✗ To'lanmagan qilish"**
3. Tasdiqlang — **bitta so'rov** bilan, tez

**📄 PDF export:**
- Yuqoridagi **"PDF"** tugmasi → joriy oy (tanlangan sinf bo'yicha) hisoboti
- **Sinflar** bo'limida → har bir sinf uchun **"To'lovlar (PDF)"** — butun o'quv yili (12 oy) jadvali

**📢 To'lov eslatmasi (Telegram):**
**"To'lov eslatmasi"** tugmasi → ko'rib chiqish (kimga boradi) → tasdiqlash. Faqat **o'z filialining** ota-onalariga boradi va har bir ota-onaga **faqat o'z farzandining** qarzi haqida xabar boradi.

> 💡 Eslatma matni o'quvchining **to'lanmagan** oylari bo'yicha shakllantiriladi.

---

### 2.5. 🏫 Sinflar

Sinflar o'quvchilar orqali avtomatik yaratiladi.

| Tugma | Vazifasi |
|---|---|
| **O'quvchilarini ko'rish** | Sinf ro'yxati |
| **Login/parol (Word)** | Ota-onalar login va parollari |
| **Qisqa ro'yxat (Word)** | Qisqa formatdagi ro'yxat |
| **To'lovlar (Word)** | Oylik to'lovlar jadvali (12 oy) |
| **To'lovlar (PDF)** | Xuddi shuning PDF versiyasi |
| **O'chirish** | Sınıfni o'chirish (o'quvchilar bilan) |

> O'quvchilarni sinfga o'tkazish: **O'quvchilar** bo'limida belgiling → **"📚 Sinfga o'tkazish"**. To'lov, davomat va baholar saqlanib qoladi.

---

### 2.6. 📅 Dars jadvali

Haftaning har bir kuni uchun darslar (fan + ketma-ketlik raqami). O'quvchilar va o'qituvchilar panelida ko'rinadi.

---

### 2.7. ✅ Davomat

Sana va sinfni tanlab, o'quvchilarni **Kелdi / Kechikdi / Kelmadi** deb belgilang.

- O'quvchi uchun **o'quvchilar ro'yxatida checkbox** bilan ko'p tanlash mumkin
- **"Kelmadi"** belgilansa, Telegram orqali **ota-onaga avtomatik xabar** yuboriladi

---

### 2.8. 📝 Baholar

1–5 baho tizimi. Fan, sinf va sana bo'yicha jadval ko'rinishida qo'yiladi. Ko'p tanlash bilan bir nechta o'quvchiga birdan baho qo'yish mumkin.

---

### 2.9. 📋 Nazorat ishlari

O'qituvchilar nazorat ishini yaratadi: nomi, sinfi, fani, sana, maksimal ball.

- **Natija kiritish** — har bir o'quvchi uchun ball
- **PDF (albom)** — har bir nazorat alohida varaqda
- **"PDF"** (barchasi) — barcha nazoratlar bitta faylda

---

### 2.10. 👨‍🏫 O'qituvchilar va 🩺 Shifokorlar

**O'qituvchi qo'shish:** ismi, lavozimi, **fanlari**, **sinflari**, **filial**, login va parol.
**Shifokor qo'shish:** ismi, lavozimi, filial, login va parol.

**"Kirish ma'lumotlari"** — o'qituvchi/shifokor login va parolini ko'rsatadi (parolni qayta yaratish ham mumkin).

> 🎨 O'qituvchi sinflari **filialga bog'liq** — o'qituvchi faqat o'z filialining o'quvchilarini ko'radi. Ikkita maktabda bir xil sinf nomi bo'lsa ham, ma'lumotlar aralashmaydi.

---

### 2.11. 📚 Fanlar

Platformadagi fanlar ro'yxati. O'qituvchilarga biriktirish uchun kerak.

---

### 2.12. 🤖 Telegram bot

Barcha filiallar **bir xil botdan** foydalanadi: **@OLIMLIDER_BOT**.

**Oynada:** ulangan ota-onalar soni, foiz, ro'yxat (ota-ona, sinf, filial, telefon), xabar yuborish.

| Tugma | Vazifasi |
|---|---|
| **🔗 Havola** | Shu ota-onaning Telegram havolasini olish (yoki kodni yangilash) |
| **Uzish** | Ulanishni bekor qilish |

**Xabar yuborish:** matn + kimga (barchasi / sinf / tanlanganlar). **Faqat o'z filialining** ota-onalariga boradi.

> 🔐 Filial admin boshqa filialning ota-onasiga xabar yubora olmaydi va uning havolasini o'zgartira olmaydi (403).

---

### 2.13. ⚙️ Sozlamalar

- **Login va parolni o'zgartirish** — joriy parol talab qilinadi
- **Aloqa** — telefon, Telegram, Instagram (saytda ko'rsatiladi)

---

### 2.14. 💬 Xabarlar (Chat)

O'quvchilar, ota-onalar, o'qituvchilar va shifokorlar bilan chat. Rolga qarab kontaktlar ro'yxati cheklangan — **filial chegarasi saqlanadi**.

---

## 3. Filial admin paneli

Filial admini **faqat o'z filialini** boshqaradi. Super admin paneli bilan bir xil bo'limlar, lekin ma'lumotlar faqat o'z filialiga tegishli.

**Qo'shimcha:** panel sarlavhasida sizning **filial nomingiz** yoziladi. "Filiallar" bo'limi ko'rinmaydi.

**O'z filialida qiladigan ishlar:**
- O'quvchi qo'shish (avtomatik o'z filialiga) va Excel/CSV import
- O'qituvchi va shifokor qo'shish
- Oylik to'lovlarni belgilash (bitta so'rov bilan, ommaviy)
- Davomat, baholar, nazorat ishlari
- Telegram: o'z ota-onalariga xabar, havolalar

---

## 4. O'qituvchi paneli

| Bo'lim | Mazmuni |
|---|---|
| **Dashbord** | O'z sinflari bo'yicha umumiy holat |
| **Davomat** | Sinf va sana bo'yicha davomat (Kelmagan → ota-onaga xabar) |
| **Baholar** | Jurnal ko'rinishida baho qo'yish |
| **Dars jadvali** | O'z sinflari jadvali |
| **Nazorat topshiriqlari** | Nazorat yaratish va natijalarini kiritish |
| **Statistika (oylik)** | Oylik baho va davomat statistikasi, eng yaxshi o'quvchilar |
| **Xabarlar** | Chat |

**Muhim:** o'qituvchi **faqat o'z sinflariga** va **o'z filialining o'quvchilariga** ko'radi.

---

## 5. Shifokor paneli

| Bo'lim | Mazmuni |
|---|---|
| **Dashbord** | 086-forma holati, kunlik tekshiruv |
| **086-formalar (6 oyga amal qiladi)** | O'quvchilarning tibbiy ruxsat holati |
| **Kunlik sog'liq tekshiruvi** | Har kuni sog'liq holati (bemor/jaroq) |
| **Xabarlar** | Chat |

---

## 6. Ota-ona paneli

| Bo'lim | Mazmuni |
|---|---|
| **Umumiy holat** | Farzandning o'rtacha bahosi, davomat statistikasi |
| **Farzand ma'lumotlari** | O'quvchi ma'lumotlari (ota-ona tahrirlaydi) |
| **Baholar** | Fanlar bo'yicha baholar |
| **Davomat** | Keldi / kechikdi / kelmadi |
| **Dars jadvali** | Haftalik jadval |
| **Kundalik** | Kunlik baho va davomat |
| **To'lovlar** | Oylik to'lov holati |
| **O'qituvchilar** | Sinf o'qituvchilari |
| **Telegram** | Botga ulashish |

> 👨‍👩‍👧 **Bir nechta farzand bo'lsa**, yuqoridagi **"Farzand:"** tanlovchisi orqali o'z farzandini tanlang. Barcha ma'lumotlar tanlangan farzandga mos keladi.
> 🏫 Farzand ismi ostida **maktab nomi** ko'rsatiladi.

---

## 7. 🤖 Telegram bot qo'llanmasi

### 7.1. Ota-onaga ulash

1. **Ota-ona panelida** yuqoridagi **"Telegram'ga ulash"** tugmasi
2. Ochilgan havola (`https://t.me/OLIMLIDER_BOT?start=XXXX`) ni ota-onaga yuboring
3. Ota-ona havolani bosadi va botga ulanadi

> Admin panelida ota-ona qo'shilganda **Telegram havolasi avtomatik yaratiladi** — "Ota-ona kirishi" oynasida topiladi.

### 7.2. Bot buyruqlari

| Buyruq | Natija |
|---|---|
| `/davomat` | Oxirgi 14 kunlik davomat |
| `/baho` | Fanlar bo'yicha baholar va o'rtacha |
| `/qarz` | To'lov holati, to'lanmagan oylar |
| `/jadval` | Haftalik dars jadvali |
| `/farzand` | Farzand ma'lumotlari |
| `/farzand 2` | Ikkinchi farzandni tanlash (bir nechta bo'lsa) |
| `/help` | Buyrumlar ro'yxati |
| `/stop` | Ulanishni bekor qilish |

**Xabarlarda maktab nomi** (`🏫 167-maktab`) ko'rsatiladi — bir nechta maktab farzandlari bo'lsa, farzandni `/farzand N` bilan tanlang.

---

## 8. Filial boshqaruvi — amaliy yo'riqnoma

### 8.1. Yangi maktab ochish

1. **Filiallar** → **"+ Filial qo'shish"**
2. Nom, maktab raqami, manzil, telefon
3. **Filial admini** login va parol
4. **Saqlash** → filial va admin birga yaratiladi

### 8.2. Maktabga o'quvchilar joylash

**Usul 1 — Ko'chirish (tez):**
**O'quvchilar** → belgilang → **"🏫 Filialga ko'chirish"** → yangi filial

**Usul 2 — Import (ko'p):**
**"📥 Import (Excel/CSV)"** → shablonni yuklab oling → to'ldiring → tahlil → **filialni tanlang** → yuklash

**Usul 3 — Qo'lda:**
**"+ O'quvchi qo'shish"** → **Filial** maydonidan yangi maktabni tanlang

### 8.3. O'qituvchi va shifokor

**O'qituvchilar** → **"+ O'qituvchi qo'shish"** → **Filial** = yangi maktab, **sinflari** = o'sha maktabning sinflari.

### 8.4. Tekshirish

| Kim | Nima tekshiriladi |
|---|---|
| Super admin | **Filial** ustuni to'g'ri ko'rsatilmoqda |
| Filial admin | Faqat o'z o'quvchilarini ko'radi |
| O'qituvchi | Faqat o'z sinflarini ko'radi |
| Shifokor | Faqat o'z filialining o'quvchilarini ko'radi |

---

## 9. Tez-tez uchraydigan savollar

**Q. Filial admin o'z filialidan tashqaridagini ko'ryaptimi?**
Yo'q. Barcha so'rovlar serverda tekshiriladi — boshqa filialga yozishga urinish **403** beradi.

**Q. Ota-onaning ikki farzandi bo'lsa, ikki marta login kerakmi?**
Yo'q. Ikkinchi farzandni qo'shsangiz, ota-onaning **eski logini** qo'llanadi va **Telegram havolasi bir qoladi**.

**Q. "To'langan qilish" tugmasi sekin ishlayaptimi?**
Hammasi **bitta so'rov** bilan yuboriladi. Agar sekin bo'lsa, o'quvchilar soni juda ko'p bo'lishi mumkin.

**Q. Eski o'quvchilar boshqa filialga ko'chirildimi, to'lovlari qayerda?**
To'lov, davomat va baholar **o'quvchi bilan birga** qoladi — hech narsa yo'qolmaydi.

**Q. Import fayli qanday bo'lishi kerak?**
`.xlsx` yoki `.csv`. **Familya** va **Ism** ustunlari shart, qolgani ixtiyoriy. Shablon faylni admin panelidan yuklab olish mumkin.

**Q. Excel'da "Oylik to'lov" yozib bo'lmayaptimi?**
Yozing, `500000` yoki `500 000` — ikkalasi ham ishlaydi.

**Q. Telegram havolasi qayerdan olinadi?**
Yangi o'quvchi qo'shilganda ochiladigan "Ota-ona kirishi" oynasida. Keyin — **Telegram** bo'limida **"🔗 Havola"** tugmasi.

**Q. Bot xabarlari boshqa maktabnikalarni aralashtiradimi?**
Yo'q. Har bir xabar **faqat o'sha ota-onaning o'z farzandiga** tegishli. Xabarda maktab nomi ko'rsatiladi.

**Q. Parolimni unutdim.**
Super admin **O'quvchilar** → ota-ona **"🔑 Kirish"** → parolni ko'rish/qayta yaratish. O'qituvchi/shifokor uchun — **"Kirish ma'lumotlari"**.

**Q. Foydalanuvchi chiqdim, panel ochilmayapti.**
**Ctrl + Shift + R** bosing (yoki sahifani qayta yuklang) — yangi versiya yuklanishi uchun.

---

## 10. Texnik ma'lumotlar

| | |
|---|---|
| Server | `olimplider.uz` · PM2 ilovasi `olimp` · port 3000 |
| Ma'lumotlar bazasi | PostgreSQL (bulut) |
| Backend | Node.js + Express 5 |
| Frontend | Vanilla JS · HTML panellar |
| Telegram bot | `@OLIMLIDER_BOT` (bitta bot — barcha filiallar uchun) |
| Fayl saqlash | `server/`, `client/`, `views/`, `data/` |

**Tillar va formatlar:** Excel `.xlsx` · CSV (`,` `;` `Tab`) · UTF-8 · PDF (A4 albom)

---

*Qo'llanma platforma bilan birga yangilanib boriladi. Savollaringiz bo'lsa — administratorga murojaat qiling.*

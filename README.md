# WhatsApp Randevu Otomasyonu

Kucuk isletmeler icin coklu isletme destekli WhatsApp randevu SaaS MVP.

Bu proje kuafor/guzellik salonu gibi randevulu calisan isletmelerin gece gelen mesajlari kacirmamasini, musterinin WhatsApp icinden self-servis randevu almasini ve randevu unutmalarindan dogan bos koltuk kaybini azaltmasini hedefler.

## Ozellikler

- Coklu isletme ve tek admin sifresiyle isletme paneli.
- WhatsApp Web QR baglantisi ve panelde QR durum takibi.
- Numarali WhatsApp menu: Randevu Al, Fiyat Listesi, Adres, Calisma Saatleri, Iptal/Degistir.
- Hizmet suresi, personel calisma saati ve mevcut randevulara gore bos saat hesaplama.
- Musterinin WhatsApp icinden randevu alma, iptal etme ve saat degistirme akisi.
- Randevudan 1 gun once ve 2 saat once otomatik hatirlatma kaydi/gonderimi.
- Web panelde hizmet, personel, calisma saatleri, randevu ve musteri notu yonetimi.

## Hızlı Kurulum

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

Ayrı terminalde worker:

```bash
npm run worker
```

Panel: `http://localhost:3000`

Seed girisleri:

- Sistem sahibi: `owner@example.com` / `owner12345`
- Ornek salon: `salon@example.com` / `salon12345`

## Docker ile Calistirma

```bash
docker compose up --build
```

Docker servisleri:

- `web`: Next.js panel ve API.
- `worker`: WhatsApp QR botu ve hatirlatma gonderimi.
- `db`: PostgreSQL.

Worker servisinde WhatsApp oturumu `whatsapp-sessions` volume icinde saklanir. QR oturumu koparsa panelde durum gorunur ve yeniden QR okutulabilir.

## WhatsApp Notu

Bu MVP resmi WhatsApp Cloud API degildir; `whatsapp-web.js` ile QR Web oturumu kullanir. Bu yontem demo ve pilot icin hizlidir, ancak uzun vadeli SaaS satisinda resmi Cloud API gecisi planlanmalidir. Kodda mesaj gonderme/alma katmani worker icinde ayrildigi icin ileride resmi provider eklemek mumkundur.

## Test ve Dogrulama

```bash
npm run test
npm run typecheck
npm run build
```

Canli demo icin:

1. `docker compose up --build` veya lokal `npm run dev` + `npm run worker` calistirin.
2. Salon adminiyle panele girin.
3. WhatsApp QR alanindaki kodu telefondan okutun.
4. Bota `merhaba` yazin.
5. `1` ile randevu akisini, `5` ile iptal/degistirme akisini deneyin.

## Satis Cümlesi

Gece gelen mesajlari kacirmazsiniz, randevu unutmaktan kaynakli bos koltuk kalmaz. Bu sistem kendini ayda kac musteriyle oder, hesaplayalim.

# DoluKoltuk

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

## Canli Yayina Alma

Onerilen kurulum: Ubuntu VPS + Docker + domain + Caddy otomatik HTTPS.

1. Domain icin DNS A kaydi olusturun:

```text
panel.dolukoltuk.com -> VPS_IP_ADRESI
```

2. VPS'te portlari acin:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

3. Docker kurulu degilse kurun ve otomatik baslatmayi acin:

```bash
sudo systemctl enable --now docker
```

4. Projeyi VPS'e koyduktan sonra production env dosyasini hazirlayin:

```bash
cp .env.production.example .env.production
nano .env.production
```

Zorunlu alanlar:

- `APP_DOMAIN`: panel domaini, ornek `panel.dolukoltuk.com`
- `APP_URL`: HTTPS adresi, ornek `https://panel.dolukoltuk.com`
- `AUTH_SECRET`: uzun rastgele gizli anahtar
- `POSTGRES_PASSWORD`: veritabani sifresi
- `OWNER_EMAIL`: sistem sahibi emaili
- `OWNER_PASSWORD`: en az 12 karakter sistem sahibi sifresi

5. Yayina alin:

```bash
./scripts/deploy-prod.sh
```

6. Log takibi:

```bash
./scripts/logs-prod.sh
./scripts/logs-prod.sh worker
```

7. Veritabani yedegi:

```bash
./scripts/backup-db.sh
```

Yayin sonrasi paneli acin, sistem sahibiyle giris yapin, yeni isletme olusturun, isletme adminiyle girip WhatsApp QR kodunu okutun.

## Vercel ile Web Yayini

Vercel, anasayfa ve web panel icin uygundur. WhatsApp QR worker uzun sure calisan Chrome oturumu gerektirdigi icin Vercel'de calismaz; worker icin VPS/Docker kullanmaya devam edin.

Vercel yayini:

```bash
npm i -g vercel
vercel login
vercel
```

Production yayini:

```bash
vercel --prod
```

Vercel Environment Variables:

```env
AUTH_SECRET=uzun-rastgele-deger
APP_URL=https://proje-adiniz.vercel.app
TZ=Europe/Istanbul
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?schema=public
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD=en-az-12-karakter
PUPPETEER_SKIP_DOWNLOAD=true
```

Vercel icin Postgres dis servis olmalidir: Neon, Supabase veya baska bir managed PostgreSQL kullanin. Docker'daki lokal `db` servisi Vercel tarafindan kullanilamaz.

## SaaS ve 7/24 Calisma

Bu surum tek VPS uzerinde coklu isletme calistirmaya hazirdir.

- Docker servislerinde `restart: unless-stopped` vardir; web veya worker duserse otomatik tekrar kalkar.
- `web` servisi `/api/health`, `worker` servisi `/healthz` endpoint'iyle healthcheck verir.
- Worker kopan WhatsApp Web oturumunu otomatik yeniden baslatmayi dener.
- Hatirlatmalar once kilitlenir, sonra gonderilir; birden fazla worker acildiginda ayni hatirlatmanin iki kez gitmesi engellenir.
- Worker yeni eklenen isletmeleri 30 saniyede bir tarar ve otomatik QR oturumu baslatir.
- Her worker varsayilan olarak en fazla 25 isletme yonetir. Bu degeri `WORKER_MAX_TENANTS` ile degistirebilirsiniz.

Tek worker ile baslangic:

```env
WORKER_SHARD_COUNT=1
WORKER_SHARD_INDEX=0
WORKER_MAX_TENANTS=25
```

Isletme sayisi artarsa worker'lari shard'layin. Ornek 2 worker:

```env
# worker-1
WORKER_SHARD_COUNT=2
WORKER_SHARD_INDEX=0

# worker-2
WORKER_SHARD_COUNT=2
WORKER_SHARD_INDEX=1
```

Onemli: WhatsApp Web QR yontemi resmi Cloud API degildir. Kucuk isletme pilotlari ve ilk satislar icin uygundur; buyuk olcekte ve uzun vadede resmi WhatsApp Cloud API'ye gecis planlanmalidir.

## Production Checklist

- `AUTH_SECRET` degerini uzun ve rastgele bir degerle degistirin.
- `POSTGRES_PASSWORD` ve `DATABASE_URL` sifresini degistirin.
- VPS'te Docker servislerini `./scripts/deploy-prod.sh` ile daemon modunda calistirin.
- Sunucu yeniden baslayinca Docker'in otomatik acilmasi icin Docker servisini enable edin.
- `whatsapp-sessions` ve `postgres-data` volume'lari yedekleyin.
- Her isletmeye ayri WhatsApp Business numarasi kullandirin.
- Toplu kampanya gonderimini QR Web surumunde kullanmayin; sadece randevu, hatirlatma ve gelen mesaja cevap akisi icin kullanin.

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

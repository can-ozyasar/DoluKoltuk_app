import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          DoluKoltuk
        </Link>
        <nav className="landing-nav" aria-label="Ana menu">
          <a href="#ozellikler">Ozellikler</a>
          <a href="#satis">Satis</a>
          <Link className="btn secondary" href="/login">
            Sisteme Giris
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <img className="landing-hero-image" src="/images/hero-salon-dashboard.png" alt="Salon randevu paneli ve WhatsApp mesajlari" />
        <div className="landing-hero-shade" />
        <div className="landing-hero-content">
          <span className="eyebrow">WhatsApp randevu otomasyonu</span>
          <h1>DoluKoltuk</h1>
          <p>Gece gelen mesajlari kacirmayan, randevu hatirlatan ve bos koltuk kaybini azaltan sade salon paneli.</p>
          <div className="landing-actions">
            <Link className="btn" href="/login">
              Sisteme Giris
            </Link>
            <a className="btn secondary" href="#ozellikler">
              Neler yapar?
            </a>
          </div>
        </div>
      </section>

      <section className="landing-band" id="ozellikler">
        <div className="landing-section-title">
          <span className="eyebrow">Basit kullanim</span>
          <h2>Salon sahibinin her gun anlayarak kullanacagi isler</h2>
        </div>
        <div className="landing-feature-grid">
          <div className="item">
            <strong>WhatsApp menusu</strong>
            <p className="muted">Randevu, fiyat, adres ve calisma saati cevaplari tek akista.</p>
          </div>
          <div className="item">
            <strong>Self-servis randevu</strong>
            <p className="muted">Musteri hizmeti, personeli ve uygun saati kendi secer.</p>
          </div>
          <div className="item">
            <strong>Otomatik hatirlatma</strong>
            <p className="muted">1 gun once ve 2 saat once hatirlatma mesajlari gider.</p>
          </div>
        </div>
      </section>

      <section className="landing-band alt" id="satis">
        <div className="landing-section-title">
          <span className="eyebrow">Satis cumlesi</span>
          <h2>Gece gelen mesaj kacmaz, randevu unutuldu diye bos koltuk kalmaz.</h2>
        </div>
        <Link className="btn" href="/login">
          Panele Git
        </Link>
      </section>
    </main>
  );
}

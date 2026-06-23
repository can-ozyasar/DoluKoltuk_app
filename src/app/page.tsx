import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          DoluKoltuk
        </Link>
        <nav className="landing-nav" aria-label="Ana menu">
          <a href="#ozellikler">Özellikler</a>
          <Link className="btn" href="/login" style={{padding: '10px 24px', borderRadius: '100px', fontSize: '14px', width: 'auto'}}>
            Giriş Yap
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <span className="eyebrow" style={{display: 'inline-block', background: 'rgba(255,255,255,0.2)', padding: '6px 16px', borderRadius: '100px', marginBottom: '24px'}}>WhatsApp Randevu Otomasyonu</span>
          <h1>Müşterilerinizi Kaçırmayın,<br/>Koltuklarınız Dolu Kalsın</h1>
          <p>DoluKoltuk, kuaför ve güzellik salonları için tasarlanmış 7/24 çalışan dijital asistanınızdır. WhatsApp üzerinden randevuları alır, hatırlatır ve işinizi kolaylaştırır.</p>
          <div className="landing-actions">
            <Link className="btn" href="/login">
              Hemen Başlayın
            </Link>
            <a className="btn secondary" href="#ozellikler">
              Nasıl Çalışır?
            </a>
          </div>
        </div>
        <div style={{marginTop: '60px', padding: '0 20px'}}>
          <img src="/images/hero-salon-dashboard.png" alt="DoluKoltuk Panel" style={{width: '100%', maxWidth: '900px', borderRadius: '20px', boxShadow: '0 24px 50px rgba(0,0,0,0.3)', border: '4px solid rgba(255,255,255,0.1)'}} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        </div>
      </section>

      <section className="landing-band" id="ozellikler">
        <div className="landing-section-title">
          <span className="eyebrow">Kolay & Etkili</span>
          <h2>İşinizi Büyütecek Özellikler</h2>
        </div>
        <div className="landing-feature-grid">
          <div className="item">
            <div style={{width: '48px', height: '48px', background: '#dcf8c6', color: '#25d366', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            </div>
            <strong>WhatsApp Entegrasyonu</strong>
            <p>Müşterileriniz alıştıkları WhatsApp uygulaması üzerinden saniyeler içinde randevu oluşturabilir, fiyat sorabilir.</p>
          </div>
          <div className="item">
            <div style={{width: '48px', height: '48px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            </div>
            <strong>7/24 Kesintisiz Hizmet</strong>
            <p>Siz uyurken bile sisteminiz çalışır. Gece gelen randevu taleplerini otomatik olarak sisteme kaydeder.</p>
          </div>
          <div className="item">
            <div style={{width: '48px', height: '48px', background: 'var(--warning-light)', color: 'var(--warning)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px'}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <strong>Otomatik Hatırlatmalar</strong>
            <p>Randevu zamanından 1 gün ve 2 saat önce müşteriye otomatik mesaj göndererek iptalleri minimuma indirir.</p>
          </div>
        </div>
      </section>

      <section className="landing-band" style={{background: 'var(--header-bg)', color: 'white', borderRadius: '40px', margin: '0 20px 60px', padding: '60px 24px', textAlign: 'center'}}>
        <h2 style={{fontSize: 'clamp(28px, 4vw, 36px)', fontWeight: 800, marginBottom: '24px', letterSpacing: '-1px'}}>DoluKoltuk ile İşinizi Dijitale Taşıyın</h2>
        <p style={{fontSize: '18px', opacity: 0.9, maxWidth: '600px', margin: '0 auto 40px'}}>Hemen sisteme giriş yapın, WhatsApp numaranızı bağlayın ve otomatik randevu sisteminin keyfini çıkarın.</p>
        <Link className="btn" href="/login" style={{background: 'white', color: 'var(--primary)', padding: '18px 40px', borderRadius: '100px', fontSize: '18px'}}>
          Panele Git
        </Link>
      </section>
    </main>
  );
}

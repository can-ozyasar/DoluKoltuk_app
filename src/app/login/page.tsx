import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage =
    params?.error === "db"
      ? "Canli panel veritabani henuz bagli degil. DATABASE_URL eklendikten sonra giris yapabilirsiniz."
      : params?.error
        ? "Email veya sifre hatali."
        : null;

  return (
    <main style={{minHeight: '100vh', background: 'var(--bg-color)', display: 'flex', flexDirection: 'column'}}>
      <div style={{background: 'var(--header-bg)', height: '300px', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 0, borderBottomLeftRadius: '40px', borderBottomRightRadius: '40px'}} />
      
      <div style={{position: 'relative', zIndex: 1, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
        <div className="card" style={{width: '100%', maxWidth: '420px', padding: '40px 32px', borderRadius: 'var(--radius-xl)', boxShadow: '0 20px 40px rgba(0,0,0,0.1)'}}>
          
          <div style={{textAlign: 'center', marginBottom: '40px'}}>
            <div style={{width: '72px', height: '72px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px', fontWeight: '900', letterSpacing: '-1px'}}>
              DK
            </div>
            <h1 style={{fontSize: '28px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px', letterSpacing: '-0.5px'}}>DoluKoltuk</h1>
            <p style={{color: 'var(--text-muted)', fontSize: '15px'}}>İşletme paneline giriş yapın</p>
          </div>

          {errorMessage && (
            <div style={{background: 'var(--danger-light)', color: 'var(--danger)', padding: '12px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 600, marginBottom: '24px', textAlign: 'center'}}>
              {errorMessage}
            </div>
          )}

          <form className="stack" action="/api/login" method="post">
            <div className="form-group">
              <label>E-posta Adresi</label>
              <input className="input-field" name="email" type="email" autoComplete="email" placeholder="ornek@salon.com" required />
            </div>
            <div className="form-group">
              <label>Şifre</label>
              <input className="input-field" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
            </div>
            <button className="btn" type="submit" style={{marginTop: '12px', borderRadius: '100px', padding: '18px', fontSize: '16px'}}>
              Giriş Yap
            </button>
          </form>

        </div>
      </div>
    </main>
  );
}

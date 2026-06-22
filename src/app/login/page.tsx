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

  return (
    <main className="login-wrap">
      <section className="card login-card">
        <div className="section-title">
          <div>
            <h1>WhatsApp Randevu Paneli</h1>
            <p className="muted">Salon admini veya sistem sahibi olarak giris yapin.</p>
          </div>
        </div>

        {params?.error ? <p className="notice error">Email veya sifre hatali.</p> : null}

        <form className="stack" action="/api/login" method="post">
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Sifre</span>
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn" type="submit">
            Giris yap
          </button>
        </form>
      </section>
    </main>
  );
}

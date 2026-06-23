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
    <main className="login-wrap">
      <section className="card login-card">
        <div className="section-title">
          <div>
            <span className="eyebrow">DoluKoltuk</span>
            <h1>Randevu paneli</h1>
            <p className="section-note">Salon girisi</p>
          </div>
        </div>

        {errorMessage ? <p className="notice error">{errorMessage}</p> : null}

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

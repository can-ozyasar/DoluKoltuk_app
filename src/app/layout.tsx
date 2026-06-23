import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "DoluKoltuk",
  description: "Kucuk isletmeler icin WhatsApp randevu ve hatirlatma otomasyonu"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}

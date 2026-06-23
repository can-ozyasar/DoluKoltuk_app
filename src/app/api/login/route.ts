import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({ where: { email } }).catch((error) => {
    console.error("Login database error", error);
    return null;
  });

  if (!user && !process.env.DATABASE_URL) {
    redirect("/login?error=db");
  }

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    redirect("/login?error=1");
  }

  await setSessionCookie(user.id);
  redirect("/dashboard");
}

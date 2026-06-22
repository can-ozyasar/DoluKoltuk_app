import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie();
  redirect("/login");
}

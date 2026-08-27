import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/session";

export default async function Home() {
  const admin = await getSessionAdmin();
  redirect(admin ? "/admin/candidates" : "/login");
}

import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: middleware also guards /admin, but verify here too.
  const admin = await getSessionAdmin();
  if (!admin) redirect("/login");

  return <AdminShell admin={{ name: admin.name, email: admin.email }}>{children}</AdminShell>;
}

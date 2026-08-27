import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionAdmin } from "@/lib/session";
import { SidebarNav } from "@/components/SidebarNav";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: middleware also guards /admin, but verify here too.
  const admin = await getSessionAdmin();
  if (!admin) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-4">
          <Link href="/admin/candidates" className="text-lg font-bold text-gray-900">
            ATS Admin
          </Link>
          <p className="mt-1 truncate text-xs text-gray-500">{admin.email}</p>
        </div>
        <div className="flex-1 p-3">
          <SidebarNav />
        </div>
        <div className="border-t border-gray-200 p-3">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}

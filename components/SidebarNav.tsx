"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/candidates/new", label: "Add Candidate" },
  { href: "/admin/import", label: "Import" },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {links.map((link) => {
        const active =
          link.href === "/admin/candidates"
            ? pathname === link.href
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`block rounded-md px-3 py-2 text-sm font-medium ${
              active
                ? "bg-brand-50 text-brand-700"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

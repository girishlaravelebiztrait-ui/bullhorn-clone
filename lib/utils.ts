import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts (last wins). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Initials from a name/email for avatar placeholders. */
export function initials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "?";
  const clean = nameOrEmail.trim();
  if (clean.includes("@")) return clean[0]?.toUpperCase() ?? "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

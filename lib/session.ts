import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export interface SessionAdmin {
  id: string;
  name?: string | null;
  email?: string | null;
}

/**
 * Returns the authenticated admin, or null. Use in server components/pages.
 */
export async function getSessionAdmin(): Promise<SessionAdmin | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as (SessionAdmin & { id?: string }) | undefined;
  if (!user?.id) return null;
  return { id: user.id, name: user.name, email: user.email };
}

/**
 * Guard for API route handlers. Returns the admin or throws an
 * `UnauthorizedError` that callers convert into a 401.
 */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function requireAdmin(): Promise<SessionAdmin> {
  const admin = await getSessionAdmin();
  if (!admin) throw new UnauthorizedError();
  return admin;
}

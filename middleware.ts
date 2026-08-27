export { default } from "next-auth/middleware";

// Protect all /admin routes. Unauthenticated users are redirected to /login
// (configured via pages.signIn in lib/auth.ts).
export const config = {
  matcher: ["/admin/:path*"],
};

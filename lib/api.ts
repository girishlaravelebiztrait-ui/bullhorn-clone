import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./session";

/** Map thrown errors to a consistent JSON error response. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", issues: err.flatten() },
      { status: 400 }
    );
  }
  // Prisma unique constraint (P2002).
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  ) {
    return NextResponse.json(
      { error: "A candidate with that email already exists" },
      { status: 409 }
    );
  }
  console.error("[API] unhandled error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return NextResponse.json({ error: message }, { status: 500 });
}

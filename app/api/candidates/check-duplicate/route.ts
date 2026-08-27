import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { findDuplicates } from "@/lib/candidate-service";

export const dynamic = "force-dynamic";

// GET /api/candidates/check-duplicate?email=&phone=&excludeId=
// Used by the add/edit form to warn (not block) on existing email/phone.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;
    const email = sp.get("email")?.trim() || undefined;
    const phone = sp.get("phone")?.trim() || undefined;
    const excludeId = sp.get("excludeId")?.trim() || undefined;

    const duplicates = await findDuplicates(email, phone, excludeId);
    return NextResponse.json({ duplicates });
  } catch (err) {
    return errorResponse(err);
  }
}

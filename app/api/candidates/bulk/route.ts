import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { bulkActionSchema } from "@/lib/validators";
import { bulkUpdateStatus, bulkDeleteCandidates } from "@/lib/candidate-service";

export const dynamic = "force-dynamic";

// POST /api/candidates/bulk — bulk status update or bulk delete.
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const action = bulkActionSchema.parse(body);

    if (action.action === "updateStatus") {
      const count = await bulkUpdateStatus(action.ids, action.status, admin.id);
      return NextResponse.json({ ok: true, count });
    }

    const count = await bulkDeleteCandidates(action.ids, admin.id);
    return NextResponse.json({ ok: true, count });
  } catch (err) {
    return errorResponse(err);
  }
}

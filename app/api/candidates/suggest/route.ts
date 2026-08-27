import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { suggestCandidates } from "@/lib/candidate-search";

export const dynamic = "force-dynamic";

// GET /api/candidates/suggest?q=prefix — typeahead suggestions.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const suggestions = await suggestCandidates(q);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return errorResponse(err);
  }
}

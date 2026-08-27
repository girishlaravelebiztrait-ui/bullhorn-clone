import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { parseSearchParams } from "@/lib/search-params";
import { searchAllIds } from "@/lib/candidate-search";
import { toCandidateView } from "@/lib/candidate";
import { candidatesToCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// GET /api/candidates/export
//   - ?ids=a,b,c        -> export just those (bulk "export selected")
//   - otherwise          -> export the full current search/filter result set
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const sp = req.nextUrl.searchParams;

    const idsParam = sp.get("ids");
    let ids: string[];
    if (idsParam) {
      ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      ids = await searchAllIds(parseSearchParams(sp));
    }

    // Pull full records from MySQL (source of truth) to preserve field order.
    const rows = ids.length
      ? await prisma.candidate.findMany({ where: { id: { in: ids } } })
      : [];

    // Preserve the search-result ordering.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as typeof rows;

    const csv = candidatesToCsv(ordered.map(toCandidateView));
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="candidates-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

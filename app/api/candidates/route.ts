import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { candidateInputSchema } from "@/lib/validators";
import { createCandidate, findDuplicates } from "@/lib/candidate-service";
import { searchCandidates } from "@/lib/candidate-search";
import { parseSearchParams } from "@/lib/search-params";
import { toCandidateView } from "@/lib/candidate";

export const dynamic = "force-dynamic";

// GET /api/candidates — ES-backed search/filter/paginate.
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const params = parseSearchParams(req.nextUrl.searchParams);
    const result = await searchCandidates(params);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/candidates — create. Returns duplicate warnings (does not block).
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const input = candidateInputSchema.parse(body);

    const duplicates = await findDuplicates(input.email, input.phone);
    // Email is unique at the DB level, so a true email dup will 409 on create.
    // Phone dup is only a warning; surface it in the response.

    const candidate = await createCandidate(input, admin.id);
    return NextResponse.json(
      { candidate: toCandidateView(candidate), duplicates },
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}

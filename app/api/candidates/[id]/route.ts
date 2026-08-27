import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { candidateUpdateSchema } from "@/lib/validators";
import { updateCandidate, deleteCandidate, findDuplicates } from "@/lib/candidate-service";
import { toCandidateView } from "@/lib/candidate";

export const dynamic = "force-dynamic";

interface Ctx {
  params: { id: string };
}

// GET /api/candidates/[id] — full record from MySQL (source of truth).
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    await requireAdmin();
    const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const activityLogs = await prisma.candidateActivityLog.findMany({
      where: { candidateId: params.id },
      orderBy: { createdAt: "desc" },
      include: { admin: { select: { name: true, email: true } } },
      take: 100,
    });

    return NextResponse.json({
      candidate: toCandidateView(candidate),
      activityLogs: activityLogs.map((l) => ({
        id: l.id,
        action: l.action,
        changes: l.changes,
        createdAt: l.createdAt.toISOString(),
        admin: l.admin,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH /api/candidates/[id] — update.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const input = candidateUpdateSchema.parse(body);

    const duplicates =
      input.email || input.phone
        ? await findDuplicates(input.email, input.phone, params.id)
        : [];

    const candidate = await updateCandidate(params.id, input, admin.id);
    return NextResponse.json({ candidate: toCandidateView(candidate), duplicates });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/candidates/[id] — delete + remove ES doc.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const admin = await requireAdmin();
    await deleteCandidate(params.id, admin.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

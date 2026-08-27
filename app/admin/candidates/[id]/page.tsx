import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toCandidateView } from "@/lib/candidate";
import { CandidateForm } from "@/components/CandidateForm";
import { ActivityLog } from "@/components/ActivityLog";

export const dynamic = "force-dynamic";

export default async function EditCandidatePage({
  params,
}: {
  params: { id: string };
}) {
  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) notFound();

  const logs = await prisma.candidateActivityLog.findMany({
    where: { candidateId: params.id },
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { name: true, email: true } } },
    take: 100,
  });

  const view = toCandidateView(candidate);

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6">
        <Link href="/admin/candidates" className="text-sm text-brand-600 hover:underline">
          ← Back to candidates
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {view.firstName} {view.lastName}
        </h1>
        <p className="text-sm text-gray-500">{view.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CandidateForm candidate={view} />
        </div>
        <div>
          <div className="card p-6">
            <h2 className="mb-4 font-semibold text-gray-900">Activity log</h2>
            <ActivityLog
              logs={logs.map((l) => ({
                id: l.id,
                action: l.action,
                changes: l.changes,
                createdAt: l.createdAt.toISOString(),
                admin: l.admin,
              }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

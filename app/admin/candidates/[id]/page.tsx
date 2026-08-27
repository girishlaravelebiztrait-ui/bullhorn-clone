import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { toCandidateView } from "@/lib/candidate";
import { CandidateForm } from "@/components/CandidateForm";
import { ActivityLog } from "@/components/ActivityLog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function EditCandidatePage({ params }: { params: { id: string } }) {
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
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/admin/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to candidates
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {view.firstName} {view.lastName}
          </h1>
          <Badge variant={statusVariant(view.status)}>{view.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{view.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CandidateForm candidate={view} />
        </div>
        <div className="xl:col-span-1">
          <Card className="xl:sticky xl:top-20">
            <CardHeader>
              <CardTitle>Activity log</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityLog
                logs={logs.map((l) => ({
                  id: l.id,
                  action: l.action,
                  changes: l.changes,
                  createdAt: l.createdAt.toISOString(),
                  admin: l.admin,
                }))}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

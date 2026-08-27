import Link from "next/link";
import { Users, UserPlus, Upload, Database, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { esIsUp } from "@/lib/elasticsearch";
import { Card } from "@/components/ui/card";
import { Badge, statusVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [total, byStatus, recentBatches, esUp] = await Promise.all([
    prisma.candidate.count(),
    prisma.candidate.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    esIsUp(),
  ]);

  const statusOrder = ["Active", "Placed", "Do Not Contact", "Blacklisted"];
  const statusMap = new Map(byStatus.map((s) => [s.status, s._count._all]));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Overview of your candidate database.</p>
        </div>
        <Badge variant={esUp ? "success" : "warning"}>
          <Database className="h-3.5 w-3.5" />
          Search index: {esUp ? "online" : "offline (degraded)"}
        </Badge>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> Total
          </div>
          <p className="mt-2 text-3xl font-semibold text-foreground">{total.toLocaleString()}</p>
        </Card>
        {statusOrder.map((status) => (
          <Card key={status} className="p-5">
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(status)}>{status}</Badge>
            </div>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {(statusMap.get(status) ?? 0).toLocaleString()}
            </p>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuickAction href="/admin/candidates" icon={<Users />} title="Browse candidates" desc="Search, filter, and manage" />
        <QuickAction href="/admin/candidates/new" icon={<UserPlus />} title="Add a candidate" desc="Manual entry + resume" />
        <QuickAction href="/admin/import" icon={<Upload />} title="Import" desc="Spreadsheet or resumes" />
      </div>

      {/* Recent imports */}
      <Card>
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold text-foreground">Recent imports</h2>
        </div>
        <div className="px-6 py-4">
          {recentBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {recentBatches.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-4 py-3">
                  <span className="truncate font-medium text-foreground">{b.fileName}</span>
                  <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                    <Badge variant="success">{b.successCount} ok</Badge>
                    {b.failedCount > 0 && <Badge variant="danger">{b.failedCount} failed</Badge>}
                    <span className="hidden sm:inline">{b.createdAt.toLocaleDateString()}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href}>
      <Card className="group flex items-center gap-4 p-5 transition-colors hover:border-primary/40 hover:bg-muted/40">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </span>
        <span className="flex-1">
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{desc}</span>
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Card>
    </Link>
  );
}

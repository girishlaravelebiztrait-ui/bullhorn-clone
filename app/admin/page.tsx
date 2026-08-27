import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { esIsUp } from "@/lib/elasticsearch";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [total, byStatus, recentBatches, esUp] = await Promise.all([
    prisma.candidate.count(),
    prisma.candidate.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    esIsUp(),
  ]);

  return (
    <div className="p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Total candidates</p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </div>
        {byStatus.map((s) => (
          <div key={s.status} className="card p-4">
            <p className="text-sm text-gray-500">{s.status}</p>
            <p className="mt-1 text-2xl font-bold">{s._count._all}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex gap-3">
        <Link href="/admin/candidates" className="btn-primary">
          View candidates
        </Link>
        <Link href="/admin/candidates/new" className="btn-secondary">
          Add candidate
        </Link>
        <Link href="/admin/import" className="btn-secondary">
          Import
        </Link>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent imports</h2>
          <span
            className={`badge ${
              esUp ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
            }`}
          >
            Search index: {esUp ? "online" : "offline (degraded)"}
          </span>
        </div>
        {recentBatches.length === 0 ? (
          <p className="text-sm text-gray-500">No imports yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {recentBatches.map((b) => (
              <li key={b.id} className="flex justify-between py-2">
                <span className="truncate">{b.fileName}</span>
                <span className="text-gray-500">
                  {b.successCount} ok / {b.failedCount} failed ·{" "}
                  {b.createdAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

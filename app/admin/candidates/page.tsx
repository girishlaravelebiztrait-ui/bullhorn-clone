import { Suspense } from "react";
import { CandidatesClient } from "@/components/CandidatesClient";

export const dynamic = "force-dynamic";

export default function CandidatesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-400">Loading…</div>}>
      <CandidatesClient />
    </Suspense>
  );
}

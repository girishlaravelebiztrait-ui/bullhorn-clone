import Link from "next/link";
import { CandidateForm } from "@/components/CandidateForm";

export default function NewCandidatePage() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <Link href="/admin/candidates" className="text-sm text-brand-600 hover:underline">
          ← Back to candidates
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Add candidate</h1>
      </div>
      <CandidateForm />
    </div>
  );
}

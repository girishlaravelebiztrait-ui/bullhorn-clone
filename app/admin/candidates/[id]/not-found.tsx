import Link from "next/link";

export default function CandidateNotFound() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900">Candidate not found</h1>
      <p className="mt-2 text-sm text-gray-500">
        This candidate may have been deleted.
      </p>
      <Link href="/admin/candidates" className="btn-primary mt-4">
        Back to candidates
      </Link>
    </div>
  );
}

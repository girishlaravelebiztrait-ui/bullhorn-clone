import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CandidateForm } from "@/components/CandidateForm";

export default function NewCandidatePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          href="/admin/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to candidates
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Add candidate
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter details manually, or upload a resume to auto-fill suggestions.
        </p>
      </div>
      <CandidateForm />
    </div>
  );
}

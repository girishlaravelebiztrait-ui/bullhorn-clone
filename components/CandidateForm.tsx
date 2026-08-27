"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CandidateView } from "@/lib/candidate";
import { CANDIDATE_STATUSES, CANDIDATE_SOURCES } from "@/lib/validators";
import { ChipInput } from "./ChipInput";
import { ConfirmDialog } from "./ConfirmDialog";

interface DuplicateMatch {
  field: "email" | "phone";
  candidate: { id: string; firstName: string; lastName: string; email: string };
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  currentEmployer: string;
  currentTitle: string;
  city: string;
  state: string;
  country: string;
  skills: string[];
  tags: string[];
  experienceYears: string;
  source: string;
  status: string;
  notes: string;
  resumeUrl: string;
  resumeText: string;
}

function toFormState(c?: CandidateView): FormState {
  return {
    firstName: c?.firstName ?? "",
    lastName: c?.lastName ?? "",
    email: c?.email ?? "",
    phone: c?.phone ?? "",
    currentEmployer: c?.currentEmployer ?? "",
    currentTitle: c?.currentTitle ?? "",
    city: c?.city ?? "",
    state: c?.state ?? "",
    country: c?.country ?? "",
    skills: c?.skills ?? [],
    tags: c?.tags ?? [],
    experienceYears: c?.experienceYears != null ? String(c.experienceYears) : "",
    source: c?.source ?? "Manual",
    status: c?.status ?? "Active",
    notes: c?.notes ?? "",
    resumeUrl: c?.resumeUrl ?? "",
    resumeText: c?.resumeText ?? "",
  };
}

export function CandidateForm({ candidate }: { candidate?: CandidateView }) {
  const router = useRouter();
  const isEdit = Boolean(candidate);
  const [form, setForm] = useState<FormState>(toFormState(candidate));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [suggestedSkills, setSuggestedSkills] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Duplicate check (warn, don't block) on email/phone blur.
  const checkDuplicates = useCallback(async () => {
    const params = new URLSearchParams();
    if (form.email) params.set("email", form.email);
    if (form.phone) params.set("phone", form.phone);
    if (candidate?.id) params.set("excludeId", candidate.id);
    if (!form.email && !form.phone) {
      setDuplicates([]);
      return;
    }
    try {
      const res = await fetch(`/api/candidates/check-duplicate?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDuplicates(data.duplicates ?? []);
      }
    } catch {
      // Non-fatal; duplicate warning is best-effort.
    }
  }, [form.email, form.phone, candidate?.id]);

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/resume-parse", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Resume parsing failed");
      }
      const data = await res.json();
      setForm((f) => ({
        ...f,
        resumeUrl: data.resumeUrl ?? f.resumeUrl,
        resumeText: data.resumeText ?? f.resumeText,
        // Only auto-fill empty identity fields; never clobber typed values.
        firstName: f.firstName || data.suggested?.firstName || "",
        lastName: f.lastName || data.suggested?.lastName || "",
        email: f.email || data.suggested?.email || "",
        phone: f.phone || data.suggested?.phone || "",
        experienceYears:
          f.experienceYears ||
          (data.suggested?.experienceYears != null
            ? String(data.suggested.experienceYears)
            : ""),
      }));
      setSuggestedSkills(data.suggested?.skills ?? []);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Resume upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "Enter a valid email";
    if (form.experienceYears && Number.isNaN(parseInt(form.experienceYears, 10)))
      e.experienceYears = "Must be a number";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSaving(true);

    const payload = {
      ...form,
      experienceYears: form.experienceYears === "" ? undefined : parseInt(form.experienceYears, 10),
    };

    try {
      const res = await fetch(
        isEdit ? `/api/candidates/${candidate!.id}` : "/api/candidates",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }
      const id = data.candidate?.id ?? candidate?.id;
      router.push(`/admin/candidates/${id}`);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!candidate) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      router.push("/admin/candidates");
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-red-600">{errors[key]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
      )}

      {duplicates.length > 0 && (
        <div className="rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          <p className="font-medium">Possible duplicate(s) found:</p>
          <ul className="mt-1 space-y-1">
            {duplicates.map((d) => (
              <li key={`${d.field}-${d.candidate.id}`}>
                Same {d.field}:{" "}
                <Link
                  href={`/admin/candidates/${d.candidate.id}`}
                  className="font-medium underline"
                  target="_blank"
                >
                  {d.candidate.firstName} {d.candidate.lastName} ({d.candidate.email})
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">You can still save — this is only a warning.</p>
        </div>
      )}

      {/* Identity */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Identity</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">First name *</label>
            <input
              className="input"
              value={form.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
            {fieldError("firstName")}
          </div>
          <div>
            <label className="label">Last name *</label>
            <input
              className="input"
              value={form.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
            {fieldError("lastName")}
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              onBlur={checkDuplicates}
            />
            {fieldError("email")}
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              onBlur={checkDuplicates}
            />
          </div>
        </div>
      </div>

      {/* Professional */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Professional</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Current employer</label>
            <input
              className="input"
              value={form.currentEmployer}
              onChange={(e) => set("currentEmployer", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Current title</label>
            <input
              className="input"
              value={form.currentTitle}
              onChange={(e) => set("currentTitle", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Experience (years)</label>
            <input
              className="input"
              inputMode="numeric"
              value={form.experienceYears}
              onChange={(e) => set("experienceYears", e.target.value)}
            />
            {fieldError("experienceYears")}
          </div>
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {CANDIDATE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Source</label>
            <select
              className="input"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
            >
              {CANDIDATE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="label">Skills</label>
          <ChipInput
            value={form.skills}
            onChange={(v) => set("skills", v)}
            placeholder="Type a skill and press Enter"
            suggestions={suggestedSkills}
          />
        </div>
        <div className="mt-4">
          <label className="label">Tags</label>
          <ChipInput
            value={form.tags}
            onChange={(v) => set("tags", v)}
            placeholder="e.g. Remote OK, Urgent"
          />
        </div>
      </div>

      {/* Location */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Location</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">City</label>
            <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <input className="input" value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div>
            <label className="label">Country</label>
            <input
              className="input"
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Resume + notes */}
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Resume & notes</h2>
        <div className="mb-4">
          <label className="label">Resume (PDF / DOCX)</label>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleResumeUpload}
            className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {uploading && <p className="mt-1 text-xs text-gray-500">Parsing resume…</p>}
          {form.resumeUrl && (
            <p className="mt-1 text-xs text-gray-600">
              Stored.{" "}
              <a
                href={`/api/files?key=${encodeURIComponent(form.resumeUrl)}`}
                target="_blank"
                className="text-brand-600 underline"
              >
                View file
              </a>
              {" · "}
              {form.resumeText ? `${form.resumeText.length.toLocaleString()} chars extracted` : ""}
            </p>
          )}
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[100px]"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create candidate"}
          </button>
          <Link href="/admin/candidates" className="btn-secondary">
            Cancel
          </Link>
        </div>
        {isEdit && (
          <button
            type="button"
            className="btn-danger"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete candidate"
        message={`Delete ${form.firstName} ${form.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </form>
  );
}

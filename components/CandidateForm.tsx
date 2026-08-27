"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, ExternalLink, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import type { CandidateView } from "@/lib/candidate";
import { CANDIDATE_STATUSES, CANDIDATE_SOURCES } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TagInput } from "@/components/ui/tag-input";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";

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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const checkDuplicates = useCallback(async () => {
    if (!form.email && !form.phone) {
      setDuplicates([]);
      return;
    }
    const params = new URLSearchParams();
    if (form.email) params.set("email", form.email);
    if (form.phone) params.set("phone", form.phone);
    if (candidate?.id) params.set("excludeId", candidate.id);
    try {
      const res = await fetch(`/api/candidates/check-duplicate?${params.toString()}`);
      if (res.ok) setDuplicates((await res.json()).duplicates ?? []);
    } catch {
      /* best effort */
    }
  }, [form.email, form.phone, candidate?.id]);

  async function handleResumeUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/resume-parse", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Resume parsing failed");
      const data = await res.json();
      setForm((f) => ({
        ...f,
        resumeUrl: data.resumeUrl ?? f.resumeUrl,
        resumeText: data.resumeText ?? f.resumeText,
        firstName: f.firstName || data.suggested?.firstName || "",
        lastName: f.lastName || data.suggested?.lastName || "",
        email: f.email || data.suggested?.email || "",
        phone: f.phone || data.suggested?.phone || "",
        experienceYears:
          f.experienceYears ||
          (data.suggested?.experienceYears != null ? String(data.suggested.experienceYears) : ""),
      }));
      setSuggestedSkills(data.suggested?.skills ?? []);
      toast.success("Resume parsed — review the suggested fields");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resume upload failed");
    } finally {
      setUploading(false);
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "First name is required";
    if (!form.lastName.trim()) e.lastName = "Last name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email";
    if (form.experienceYears && Number.isNaN(parseInt(form.experienceYears, 10)))
      e.experienceYears = "Must be a number";
    setErrors(e);
    if (Object.keys(e).length) toast.error("Please fix the highlighted fields");
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      ...form,
      experienceYears: form.experienceYears === "" ? undefined : parseInt(form.experienceYears, 10),
    };
    try {
      const res = await fetch(isEdit ? `/api/candidates/${candidate!.id}` : "/api/candidates", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success(isEdit ? "Changes saved" : "Candidate created");
      const id = data.candidate?.id ?? candidate?.id;
      router.push(`/admin/candidates/${id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!candidate) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/candidates/${candidate.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Candidate deleted");
      router.push("/admin/candidates");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const fieldError = (key: string) =>
    errors[key] ? <p className="mt-1 text-xs text-danger-text">{errors[key]}</p> : null;

  return (
    <form onSubmit={handleSubmit} className="pb-24">
      {duplicates.length > 0 && (
        <div className="mb-6 flex gap-3 rounded-xl border border-warning/30 bg-warning-subtle px-4 py-3 text-sm text-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Possible duplicate(s) found</p>
            <ul className="mt-1 space-y-0.5">
              {duplicates.map((d) => (
                <li key={`${d.field}-${d.candidate.id}`}>
                  Same {d.field}:{" "}
                  <Link
                    href={`/admin/candidates/${d.candidate.id}`}
                    className="font-medium underline underline-offset-2"
                    target="_blank"
                  >
                    {d.candidate.firstName} {d.candidate.lastName} ({d.candidate.email})
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs opacity-80">You can still save — this is only a warning.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Basic information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>First name *</Label>
              <Input value={form.firstName} invalid={!!errors.firstName} onChange={(e) => set("firstName", e.target.value)} />
              {fieldError("firstName")}
            </div>
            <div>
              <Label>Last name *</Label>
              <Input value={form.lastName} invalid={!!errors.lastName} onChange={(e) => set("lastName", e.target.value)} />
              {fieldError("lastName")}
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} onBlur={checkDuplicates} />
              {fieldError("email")}
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={checkDuplicates} />
            </div>
          </CardContent>
        </Card>

        {/* Employment */}
        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Current employer</Label>
              <Input value={form.currentEmployer} onChange={(e) => set("currentEmployer", e.target.value)} />
            </div>
            <div>
              <Label>Current title</Label>
              <Input value={form.currentTitle} onChange={(e) => set("currentTitle", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>Experience (yrs)</Label>
                <Input inputMode="numeric" value={form.experienceYears} invalid={!!errors.experienceYears} onChange={(e) => set("experienceYears", e.target.value)} />
                {fieldError("experienceYears")}
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {CANDIDATE_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Source</Label>
                <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
                  {CANDIDATE_SOURCES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  {!CANDIDATE_SOURCES.includes(form.source as never) && (
                    <option value={form.source}>{form.source}</option>
                  )}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>State / Province</Label>
                <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
              </div>
              <div>
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills & Tags */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Skills &amp; tags</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <Label>Skills</Label>
              <TagInput value={form.skills} onChange={(v) => set("skills", v)} placeholder="Type a skill, press Enter" suggestions={suggestedSkills} />
            </div>
            <div>
              <Label>Tags</Label>
              <TagInput value={form.tags} onChange={(v) => set("tags", v)} placeholder="e.g. Remote OK, Urgent" />
            </div>
          </CardContent>
        </Card>

        {/* Resume */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Resume</CardTitle>
          </CardHeader>
          <CardContent>
            {uploading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Parsing resume…
              </div>
            ) : (
              <FileDropzone
                accept=".pdf,.docx,.doc,.txt"
                hint="PDF, DOCX, DOC or TXT"
                onFiles={(files) => files[0] && handleResumeUpload(files[0])}
              />
            )}
            {form.resumeUrl && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-foreground">
                  Resume stored
                  {form.resumeText ? (
                    <span className="text-muted-foreground"> · {form.resumeText.length.toLocaleString()} chars extracted</span>
                  ) : null}
                </span>
                <a
                  href={`/api/files?key=${encodeURIComponent(form.resumeUrl)}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  View <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Add any internal notes about this candidate…" />
          </CardContent>
        </Card>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {isEdit ? (
            <Button type="button" variant="ghost" className="text-danger-text hover:bg-danger-subtle" onClick={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Link href="/admin/candidates">
              <Button type="button" variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" loading={saving}>
              {isEdit ? "Save changes" : "Create candidate"}
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete candidate"
        message={`Delete ${form.firstName} ${form.lastName}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onOpenChange={setConfirmDelete}
      />
    </form>
  );
}

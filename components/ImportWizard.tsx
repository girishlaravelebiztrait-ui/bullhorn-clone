"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { FileSpreadsheet, FileText, ArrowLeft, ArrowRight, ChevronDown } from "lucide-react";
import { CANDIDATE_FIELD_KEYS, type CandidateFieldKey } from "@/lib/validators";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stepper } from "@/components/ui/stepper";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { toast } from "@/components/ui/toast";

interface ImportRowResult {
  rowNumber: number;
  status: "success" | "skipped" | "failed";
  reason?: string;
  candidateId?: string;
  email?: string;
}
interface ImportSummary {
  batchId: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  results: ImportRowResult[];
}

const FIELD_LABELS: Record<CandidateFieldKey, string> = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  currentEmployer: "Current employer",
  currentTitle: "Current title",
  city: "City",
  state: "State",
  country: "Country",
  skills: "Skills",
  tags: "Tags",
  experienceYears: "Experience years",
  status: "Status",
  notes: "Notes",
};

function guessField(header: string): CandidateFieldKey | "" {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  const table: Record<string, CandidateFieldKey> = {
    firstname: "firstName", fname: "firstName", givenname: "firstName",
    lastname: "lastName", lname: "lastName", surname: "lastName",
    email: "email", emailaddress: "email",
    phone: "phone", phonenumber: "phone", mobile: "phone",
    employer: "currentEmployer", currentemployer: "currentEmployer", company: "currentEmployer",
    title: "currentTitle", currenttitle: "currentTitle", jobtitle: "currentTitle", position: "currentTitle",
    city: "city", state: "state", province: "state", country: "country",
    skills: "skills", skill: "skills", tags: "tags", tag: "tags",
    experience: "experienceYears", experienceyears: "experienceYears", yearsofexperience: "experienceYears", years: "experienceYears",
    status: "status", notes: "notes", note: "notes", comments: "notes",
  };
  return table[h] ?? "";
}

type Mode = "choose" | "table" | "resumes";

export function ImportWizard() {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Import candidates</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Bulk-add candidates from a spreadsheet, or drop resume files to parse.
      </p>

      {mode === "choose" && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MethodCard
            icon={<FileSpreadsheet />}
            title="Spreadsheet"
            desc="Upload a .csv / .xlsx / .xls, map columns to fields, then import."
            onClick={() => setMode("table")}
          />
          <MethodCard
            icon={<FileText />}
            title="Resume files"
            desc="Upload PDF / DOCX resumes. We extract text and candidate details."
            onClick={() => setMode("resumes")}
          />
        </div>
      )}

      {mode === "table" && <TableImport onBack={() => setMode("choose")} />}
      {mode === "resumes" && <ResumeImport onBack={() => setMode("choose")} />}
    </div>
  );
}

function MethodCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="h-full p-6 transition-colors hover:border-primary/40 hover:bg-muted/40">
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-primary-subtle text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </span>
        <h2 className="font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </Card>
    </button>
  );
}

// ---------------- Tabular import ----------------

type TableStep = "upload" | "map" | "review" | "done";
const TABLE_STEPS = ["Upload", "Map Columns", "Review", "Done"];

function TableImport({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<TableStep>("upload");
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CandidateFieldKey | "">>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const stepIndex = { upload: 0, map: 1, review: 2, done: 3 }[step];

  async function handleFile(file: File) {
    setParsing(true);
    try {
      const lower = file.name.toLowerCase();
      let parsedRows: Record<string, unknown>[] = [];
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        parsedRows = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true }).data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      }
      if (parsedRows.length === 0) throw new Error("No rows found in file.");
      const cols = Object.keys(parsedRows[0]);
      setFileName(file.name);
      setColumns(cols);
      setRows(parsedRows);
      setMapping(Object.fromEntries(cols.map((c) => [c, guessField(c)])));
      setStep("map");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setParsing(false);
    }
  }

  const mappedFields = Object.values(mapping).filter(Boolean);
  const hasRequired =
    mappedFields.includes("firstName") && mappedFields.includes("lastName") && mappedFields.includes("email");

  async function runImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, rows, mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSummary(data);
      setStep("done");
      toast.success(`Imported ${data.successCount} of ${data.totalRows} rows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <Card className="p-5">
        <Stepper steps={TABLE_STEPS} current={stepIndex} />
      </Card>

      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a spreadsheet</CardTitle>
          </CardHeader>
          <CardContent>
            <FileDropzone accept=".csv,.xlsx,.xls" hint="CSV, XLSX or XLS" onFiles={(f) => f[0] && handleFile(f[0])} disabled={parsing} />
            {parsing && <p className="mt-3 text-sm text-muted-foreground">Parsing…</p>}
            <div className="mt-4">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft /> Choose a different method
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "map" && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{rows.length}</span> row(s) detected in{" "}
              <span className="font-medium text-foreground">{fileName}</span>. Map each column to a field.
            </p>
            <div className="space-y-2.5">
              {columns.map((col) => (
                <div key={col} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
                  <span className="w-1/2 truncate text-sm font-medium text-foreground">{col}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Select
                    className="w-1/2"
                    value={mapping[col] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value as CandidateFieldKey | "" }))}
                  >
                    <option value="">— Ignore —</option>
                    {CANDIDATE_FIELD_KEYS.map((f) => (
                      <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            {!hasRequired && (
              <p className="mt-4 rounded-md bg-warning-subtle px-3 py-2 text-xs text-warning-text">
                First name, last name, and email must all be mapped. Rows missing any of these will be skipped.
              </p>
            )}
            <div className="mt-5 flex justify-between">
              <Button variant="ghost" onClick={() => setStep("upload")}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={() => setStep("review")} disabled={!hasRequired}>
                Review <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Preview of the first 5 rows as they'll be imported.</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    {columns.filter((c) => mapping[c]).map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">{FIELD_LABELS[mapping[c] as CandidateFieldKey]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {columns.filter((c) => mapping[c]).map((c) => (
                        <td key={c} className="px-3 py-2 text-foreground">{String(r[c] ?? "")}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-between">
              <Button variant="ghost" onClick={() => setStep("map")}>
                <ArrowLeft /> Back
              </Button>
              <Button onClick={runImport} loading={importing}>
                Import {rows.length} row(s)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && summary && <SummaryView summary={summary} onReset={onBack} />}
    </div>
  );
}

// ---------------- Resume import ----------------

const RESUME_STEPS = ["Upload", "Done"];

function ResumeImport({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function runImport() {
    if (files.length === 0) return;
    setImporting(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/import/resumes", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSummary(data);
      toast.success(`Imported ${data.successCount} of ${data.totalRows} resume(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <Card className="p-5">
        <Stepper steps={RESUME_STEPS} current={summary ? 1 : 0} />
      </Card>

      {summary ? (
        <SummaryView summary={summary} onReset={onBack} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Upload resume files</CardTitle>
          </CardHeader>
          <CardContent>
            <FileDropzone
              accept=".pdf,.docx,.doc,.txt"
              multiple
              hint="PDF, DOCX, DOC or TXT — multiple allowed"
              files={files}
              onFiles={(f) => setFiles((prev) => [...prev, ...f])}
              onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={importing}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Each resume is parsed for name, email, phone, and skills. Files without a detectable email are reported as failed.
            </p>
            <div className="mt-5 flex justify-between">
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft /> Choose a different method
              </Button>
              <Button onClick={runImport} loading={importing} disabled={files.length === 0}>
                Import {files.length} resume(s)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------- Shared summary ----------------

function SummaryView({ summary, onReset }: { summary: ImportSummary; onReset: () => void }) {
  const [showFailures, setShowFailures] = useState(true);
  const failures = summary.results.filter((r) => r.status !== "success");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import complete</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Total rows" value={summary.totalRows} />
            <Stat label="Imported" value={summary.successCount} tone="success" />
            <Stat label="Failed / skipped" value={summary.failedCount} tone="danger" />
          </div>
        </CardContent>
      </Card>

      {failures.length > 0 && (
        <Card>
          <button
            onClick={() => setShowFailures((v) => !v)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <span className="font-semibold text-foreground">Rows not imported ({failures.length})</span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showFailures && "rotate-180")} />
          </button>
          {showFailures && (
            <div className="overflow-x-auto border-t border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Row</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {failures.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-4 py-2 tabular-nums">{r.rowNumber}</td>
                      <td className="px-4 py-2">
                        <Badge variant={r.status === "skipped" ? "warning" : "danger"}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{r.email ?? "—"}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <div className="flex gap-3">
        <Link href="/admin/candidates">
          <Button>View candidates</Button>
        </Link>
        <Button variant="secondary" onClick={onReset}>Import more</Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success-text" : tone === "danger" ? "text-danger-text" : "text-foreground";
  return (
    <div className="rounded-lg bg-muted/50 p-4 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-3xl font-semibold", color)}>{value}</p>
    </div>
  );
}

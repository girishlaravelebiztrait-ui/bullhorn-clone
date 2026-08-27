"use client";

import { useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CANDIDATE_FIELD_KEYS, type CandidateFieldKey } from "@/lib/validators";

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

// Guess a candidate field from a source column header.
function guessField(header: string): CandidateFieldKey | "" {
  const h = header.toLowerCase().replace(/[^a-z]/g, "");
  const table: Record<string, CandidateFieldKey> = {
    firstname: "firstName",
    fname: "firstName",
    givenname: "firstName",
    lastname: "lastName",
    lname: "lastName",
    surname: "lastName",
    email: "email",
    emailaddress: "email",
    phone: "phone",
    phonenumber: "phone",
    mobile: "phone",
    employer: "currentEmployer",
    currentemployer: "currentEmployer",
    company: "currentEmployer",
    title: "currentTitle",
    currenttitle: "currentTitle",
    jobtitle: "currentTitle",
    position: "currentTitle",
    city: "city",
    state: "state",
    province: "state",
    country: "country",
    skills: "skills",
    skill: "skills",
    tags: "tags",
    tag: "tags",
    experience: "experienceYears",
    experienceyears: "experienceYears",
    yearsofexperience: "experienceYears",
    years: "experienceYears",
    status: "status",
    notes: "notes",
    note: "notes",
    comments: "notes",
  };
  return table[h] ?? "";
}

type Mode = "choose" | "table" | "resumes";

export function ImportWizard() {
  const [mode, setMode] = useState<Mode>("choose");

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Import candidates</h1>
      <p className="mb-6 text-sm text-gray-500">
        Bulk-add candidates from a spreadsheet, or drop resume files to parse.
      </p>

      {mode === "choose" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button className="card p-6 text-left hover:border-brand-400" onClick={() => setMode("table")}>
            <h2 className="font-semibold text-gray-900">Spreadsheet</h2>
            <p className="mt-1 text-sm text-gray-500">
              Upload a .csv / .xlsx / .xls, map columns to fields, then import.
            </p>
          </button>
          <button className="card p-6 text-left hover:border-brand-400" onClick={() => setMode("resumes")}>
            <h2 className="font-semibold text-gray-900">Resume files</h2>
            <p className="mt-1 text-sm text-gray-500">
              Upload PDF / DOCX resumes. We extract text and candidate details.
            </p>
          </button>
        </div>
      )}

      {mode === "table" && <TableImport onBack={() => setMode("choose")} />}
      {mode === "resumes" && <ResumeImport onBack={() => setMode("choose")} />}
    </div>
  );
}

// ---------------- Tabular import ----------------

function TableImport({ onBack }: { onBack: () => void }) {
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CandidateFieldKey | "">>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError(null);
    setSummary(null);
    try {
      const lower = file.name.toLowerCase();
      let parsedRows: Record<string, unknown>[] = [];

      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const result = Papa.parse<Record<string, unknown>>(text, {
          header: true,
          skipEmptyLines: true,
        });
        parsedRows = result.data;
      } else {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        parsedRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      }

      if (parsedRows.length === 0) {
        throw new Error("No rows found in file.");
      }
      const cols = Object.keys(parsedRows[0]);
      setFileName(file.name);
      setColumns(cols);
      setRows(parsedRows);
      setMapping(Object.fromEntries(cols.map((c) => [c, guessField(c)])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file.");
    } finally {
      setParsing(false);
    }
  }

  const mappedFields = Object.values(mapping).filter(Boolean);
  const hasRequired =
    mappedFields.includes("firstName") &&
    mappedFields.includes("lastName") &&
    mappedFields.includes("email");

  async function runImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, rows, mapping }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (summary) return <SummaryView summary={summary} onReset={onBack} />;

  return (
    <div className="space-y-6">
      <BackLink onBack={onBack} />

      <div className="card p-6">
        <label className="label">Choose a spreadsheet</label>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
        {parsing && <p className="mt-2 text-sm text-gray-500">Parsing…</p>}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {columns.length > 0 && (
        <>
          <div className="card p-6">
            <h2 className="mb-1 font-semibold text-gray-900">Map columns</h2>
            <p className="mb-4 text-sm text-gray-500">
              {rows.length} row(s) detected. Map each column to a candidate field (or ignore).
            </p>
            <div className="space-y-3">
              {columns.map((col) => (
                <div key={col} className="flex items-center gap-3">
                  <span className="w-1/2 truncate text-sm font-medium text-gray-700">{col}</span>
                  <span className="text-gray-400">→</span>
                  <select
                    className="input w-1/2"
                    value={mapping[col] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [col]: e.target.value as CandidateFieldKey | "" }))
                    }
                  >
                    <option value="">— Ignore —</option>
                    {CANDIDATE_FIELD_KEYS.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_LABELS[f]}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {!hasRequired && (
              <p className="mt-4 rounded-md bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                First name, last name, and email must all be mapped. Rows missing any of these
                will be skipped and reported.
              </p>
            )}
          </div>

          {/* Preview */}
          <div className="card p-6">
            <h2 className="mb-3 font-semibold text-gray-900">Preview (first 5 rows)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="text-left text-gray-500">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="px-2 py-1">
                        {c}
                        {mapping[c] ? (
                          <span className="block font-normal text-brand-600">
                            → {FIELD_LABELS[mapping[c] as CandidateFieldKey]}
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      {columns.map((c) => (
                        <td key={c} className="px-2 py-1 text-gray-700">
                          {String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <button className="btn-primary" disabled={importing} onClick={runImport}>
            {importing ? "Importing…" : `Import ${rows.length} row(s)`}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------- Resume import ----------------

function ResumeImport({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runImport() {
    if (files.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/import/resumes", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (summary) return <SummaryView summary={summary} onReset={onBack} />;

  return (
    <div className="space-y-6">
      <BackLink onBack={onBack} />
      <div className="card p-6">
        <label className="label">Choose resume files (PDF / DOCX)</label>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.txt"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
        />
        {files.length > 0 && (
          <ul className="mt-3 list-inside list-disc text-sm text-gray-600">
            {files.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">
          Each resume is parsed for name, email, phone, and skills. Files without a detectable
          email are reported as failed.
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <button className="btn-primary" disabled={importing || files.length === 0} onClick={runImport}>
        {importing ? "Parsing & importing…" : `Import ${files.length} resume(s)`}
      </button>
    </div>
  );
}

// ---------------- Shared ----------------

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="text-sm text-brand-600 hover:underline">
      ← Choose a different method
    </button>
  );
}

function SummaryView({ summary, onReset }: { summary: ImportSummary; onReset: () => void }) {
  const failures = summary.results.filter((r) => r.status !== "success");
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <h2 className="mb-4 font-semibold text-gray-900">Import complete</h2>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Total" value={summary.totalRows} />
          <Stat label="Imported" value={summary.successCount} tone="green" />
          <Stat label="Failed / skipped" value={summary.failedCount} tone="red" />
        </div>
      </div>

      {failures.length > 0 && (
        <div className="card p-6">
          <h3 className="mb-3 font-semibold text-gray-900">Rows not imported</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-1">Row</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Email</th>
                  <th className="px-2 py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((r) => (
                  <tr key={r.rowNumber} className="border-t border-gray-100">
                    <td className="px-2 py-1">{r.rowNumber}</td>
                    <td className="px-2 py-1">
                      <span
                        className={`badge ${
                          r.status === "skipped"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-gray-600">{r.email ?? "—"}</td>
                    <td className="px-2 py-1 text-gray-600">{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/admin/candidates" className="btn-primary">
          View candidates
        </Link>
        <button onClick={onReset} className="btn-secondary">
          Import more
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" }) {
  const color =
    tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div className="rounded-md bg-gray-50 p-4 text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

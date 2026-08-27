import Papa from "papaparse";
import type { CandidateView } from "./candidate";

const EXPORT_COLUMNS: { header: string; get: (c: CandidateView) => string }[] = [
  { header: "First Name", get: (c) => c.firstName },
  { header: "Last Name", get: (c) => c.lastName },
  { header: "Email", get: (c) => c.email },
  { header: "Phone", get: (c) => c.phone ?? "" },
  { header: "Current Employer", get: (c) => c.currentEmployer ?? "" },
  { header: "Current Title", get: (c) => c.currentTitle ?? "" },
  { header: "City", get: (c) => c.city ?? "" },
  { header: "State", get: (c) => c.state ?? "" },
  { header: "Country", get: (c) => c.country ?? "" },
  { header: "Skills", get: (c) => c.skills.join("; ") },
  { header: "Tags", get: (c) => c.tags.join("; ") },
  { header: "Experience Years", get: (c) => (c.experienceYears ?? "").toString() },
  { header: "Source", get: (c) => c.source },
  { header: "Status", get: (c) => c.status },
  { header: "Notes", get: (c) => c.notes ?? "" },
  { header: "Created At", get: (c) => c.createdAt },
];

/** Serialize candidate views to a CSV string. */
export function candidatesToCsv(candidates: CandidateView[]): string {
  const rows = candidates.map((c) => {
    const row: Record<string, string> = {};
    for (const col of EXPORT_COLUMNS) row[col.header] = col.get(c);
    return row;
  });
  return Papa.unparse({
    fields: EXPORT_COLUMNS.map((c) => c.header),
    data: rows.map((r) => EXPORT_COLUMNS.map((c) => r[c.header])),
  });
}

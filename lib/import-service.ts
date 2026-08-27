import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { bulkIndexCandidates } from "./candidate-service";
import { candidateInputSchema, type CandidateFieldKey } from "./validators";

export interface ImportRowResult {
  rowNumber: number;
  status: "success" | "skipped" | "failed";
  reason?: string;
  candidateId?: string;
  email?: string;
}

export interface ImportSummary {
  batchId: string;
  fileName: string;
  totalRows: number;
  successCount: number;
  failedCount: number;
  results: ImportRowResult[];
}

// Fields that should be parsed as arrays from a delimited cell.
const ARRAY_FIELDS = new Set<CandidateFieldKey>(["skills", "tags"]);

function splitList(value: string): string[] {
  return value
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Map one raw source row into a candidate input object using the column mapping.
 * `mapping` is sourceHeader -> candidate field key.
 */
export function mapRow(
  row: Record<string, unknown>,
  mapping: Record<string, CandidateFieldKey>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [sourceHeader, fieldKey] of Object.entries(mapping)) {
    if (!fieldKey) continue;
    const raw = row[sourceHeader];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value === "") continue;

    if (ARRAY_FIELDS.has(fieldKey)) {
      out[fieldKey] = splitList(value);
    } else if (fieldKey === "experienceYears") {
      const n = parseInt(value, 10);
      if (Number.isFinite(n)) out[fieldKey] = n;
    } else {
      out[fieldKey] = value;
    }
  }
  return out;
}

/**
 * Process a batch of already-mapped candidate inputs:
 *   - validate required fields (firstName, lastName, email)
 *   - skip duplicate emails (existing in DB or duplicated within the batch)
 *   - bulk insert valid rows
 *   - bulk index to ES
 *   - create ImportBatch + "imported" activity logs
 */
export async function processImport(
  fileName: string,
  mappedRows: Record<string, unknown>[],
  adminId: string,
  defaults: { source?: string } = {}
): Promise<ImportSummary> {
  const results: ImportRowResult[] = [];
  const validInputs: { rowNumber: number; data: Record<string, unknown> }[] = [];
  const seenEmails = new Set<string>();

  // Pre-load existing emails to detect DB duplicates without a query per row.
  const candidateEmails = mappedRows
    .map((r) => (typeof r.email === "string" ? r.email.toLowerCase().trim() : null))
    .filter((e): e is string => Boolean(e));
  const existing = candidateEmails.length
    ? await prisma.candidate.findMany({
        where: { email: { in: candidateEmails } },
        select: { email: true },
      })
    : [];
  const existingEmails = new Set(existing.map((e) => e.email.toLowerCase()));

  mappedRows.forEach((row, i) => {
    const rowNumber = i + 1;
    const parsed = candidateInputSchema.safeParse({
      source: defaults.source ?? "Import",
      ...row,
    });

    if (!parsed.success) {
      const missing = parsed.error.issues.map((iss) => iss.path.join(".") || "field");
      results.push({
        rowNumber,
        status: "failed",
        reason: `Validation failed: ${Array.from(new Set(missing)).join(", ")}`,
      });
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    if (existingEmails.has(email)) {
      results.push({ rowNumber, status: "skipped", reason: "Duplicate email (already exists)", email });
      return;
    }
    if (seenEmails.has(email)) {
      results.push({ rowNumber, status: "skipped", reason: "Duplicate email (within file)", email });
      return;
    }
    seenEmails.add(email);

    validInputs.push({
      rowNumber,
      data: { ...parsed.data, email, source: parsed.data.source ?? "Import" },
    });
  });

  // Bulk insert valid rows. createMany can't return generated IDs on MySQL,
  // so insert then fetch by email to link IDs/logs and index ES docs.
  if (validInputs.length) {
    await prisma.candidate.createMany({
      data: validInputs.map((v) => v.data as Prisma.CandidateCreateManyInput),
      skipDuplicates: true,
    });

    const emails = validInputs.map((v) => (v.data.email as string));
    const inserted = await prisma.candidate.findMany({
      where: { email: { in: emails } },
    });
    const byEmail = new Map(inserted.map((c) => [c.email.toLowerCase(), c]));

    for (const v of validInputs) {
      const c = byEmail.get((v.data.email as string).toLowerCase());
      if (c) {
        results.push({ rowNumber: v.rowNumber, status: "success", candidateId: c.id, email: c.email });
      } else {
        // Should not happen, but report it rather than silently dropping.
        results.push({ rowNumber: v.rowNumber, status: "failed", reason: "Insert did not persist" });
      }
    }

    // Activity logs + ES bulk index for successfully inserted candidates.
    await prisma.candidateActivityLog.createMany({
      data: inserted.map((c) => ({
        candidateId: c.id,
        adminId,
        action: "imported",
        changes: { imported: true, fileName } as Prisma.InputJsonValue,
      })),
    });
    await bulkIndexCandidates(inserted);
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const failedCount = results.length - successCount;

  const batch = await prisma.importBatch.create({
    data: {
      fileName,
      totalRows: mappedRows.length,
      successCount,
      failedCount,
      adminId,
    },
  });

  // Sort results by row number for a stable report.
  results.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    batchId: batch.id,
    fileName,
    totalRows: mappedRows.length,
    successCount,
    failedCount,
    results,
  };
}

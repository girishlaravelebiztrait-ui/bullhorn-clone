import type { Candidate, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { esClient, CANDIDATES_INDEX } from "./elasticsearch";
import { toEsDoc, toStringArray } from "./candidate";
import type { CandidateInput, CandidateUpdate } from "./validators";

/**
 * Candidate service: the single choke point for all Candidate writes.
 *
 * Every mutation:
 *   1. Writes to MySQL (source of truth) via Prisma.
 *   2. Write-through syncs the Elasticsearch document.
 *   3. Records a CandidateActivityLog entry.
 *
 * ES failures are caught and logged — they never fail the DB write. If ES is
 * down, the index drifts until the next reindex (scripts/reindex.ts).
 */

// ---------- Elasticsearch write-through (best effort) ----------

export async function indexCandidateDoc(candidate: Candidate): Promise<void> {
  try {
    await esClient.index({
      index: CANDIDATES_INDEX,
      id: candidate.id,
      document: toEsDoc(candidate),
      refresh: "wait_for",
    });
  } catch (err) {
    console.error(`[ES] failed to index candidate ${candidate.id}:`, err);
  }
}

export async function deleteCandidateDoc(id: string): Promise<void> {
  try {
    await esClient.delete(
      { index: CANDIDATES_INDEX, id, refresh: "wait_for" },
      { ignore: [404] }
    );
  } catch (err) {
    console.error(`[ES] failed to delete candidate doc ${id}:`, err);
  }
}

/** Bulk index many candidates (used by import + reindex). Best effort. */
export async function bulkIndexCandidates(candidates: Candidate[]): Promise<void> {
  if (candidates.length === 0) return;
  try {
    const operations = candidates.flatMap((c) => [
      { index: { _index: CANDIDATES_INDEX, _id: c.id } },
      toEsDoc(c),
    ]);
    const resp = await esClient.bulk({ operations, refresh: "wait_for" });
    if (resp.errors) {
      const failed = resp.items.filter((i) => i.index?.error);
      console.error(`[ES] bulk index had ${failed.length} errors`, failed.slice(0, 3));
    }
  } catch (err) {
    console.error("[ES] bulk index failed:", err);
  }
}

// ---------- Diff helper for the activity log ----------

function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>
): Prisma.InputJsonValue {
  if (!before) return { after } as Prisma.InputJsonValue;
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  return { changes } as Prisma.InputJsonValue;
}

function toComparable(c: Candidate): Record<string, unknown> {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    currentEmployer: c.currentEmployer,
    currentTitle: c.currentTitle,
    city: c.city,
    state: c.state,
    country: c.country,
    skills: toStringArray(c.skills),
    tags: toStringArray(c.tags),
    experienceYears: c.experienceYears,
    source: c.source,
    status: c.status,
    notes: c.notes,
    resumeUrl: c.resumeUrl,
  };
}

// ---------- Duplicate detection ----------

export interface DuplicateMatch {
  field: "email" | "phone";
  candidate: { id: string; firstName: string; lastName: string; email: string };
}

/**
 * Find existing candidates matching by email or phone. Used to *warn* (not
 * block) on manual save. `excludeId` skips the candidate being edited.
 */
export async function findDuplicates(
  email: string | undefined,
  phone: string | undefined,
  excludeId?: string
): Promise<DuplicateMatch[]> {
  const matches: DuplicateMatch[] = [];
  const select = { id: true, firstName: true, lastName: true, email: true };

  if (email) {
    const byEmail = await prisma.candidate.findFirst({
      where: { email: email.toLowerCase().trim(), NOT: excludeId ? { id: excludeId } : undefined },
      select,
    });
    if (byEmail) matches.push({ field: "email", candidate: byEmail });
  }
  if (phone) {
    const byPhone = await prisma.candidate.findFirst({
      where: { phone: phone.trim(), NOT: excludeId ? { id: excludeId } : undefined },
      select,
    });
    if (byPhone) matches.push({ field: "phone", candidate: byPhone });
  }
  return matches;
}

// ---------- Core mutations ----------

function inputToData(input: CandidateInput | CandidateUpdate): Prisma.CandidateUncheckedCreateInput {
  const data: Record<string, unknown> = { ...input };
  if (input.email) data.email = input.email.toLowerCase().trim();
  if ("skills" in input && input.skills) data.skills = input.skills;
  if ("tags" in input && input.tags) data.tags = input.tags;
  return data as Prisma.CandidateUncheckedCreateInput;
}

export async function createCandidate(
  input: CandidateInput,
  adminId: string
): Promise<Candidate> {
  const candidate = await prisma.candidate.create({
    data: inputToData(input),
  });

  await prisma.candidateActivityLog.create({
    data: {
      candidateId: candidate.id,
      adminId,
      action: "created",
      changes: diff(null, toComparable(candidate)),
    },
  });

  await indexCandidateDoc(candidate);
  return candidate;
}

export async function updateCandidate(
  id: string,
  input: CandidateUpdate,
  adminId: string
): Promise<Candidate> {
  const before = await prisma.candidate.findUnique({ where: { id } });
  if (!before) throw new Error("Candidate not found");

  const candidate = await prisma.candidate.update({
    where: { id },
    data: inputToData(input),
  });

  await prisma.candidateActivityLog.create({
    data: {
      candidateId: candidate.id,
      adminId,
      action: "updated",
      changes: diff(toComparable(before), toComparable(candidate)),
    },
  });

  await indexCandidateDoc(candidate);
  return candidate;
}

export async function deleteCandidate(id: string, adminId: string): Promise<void> {
  const before = await prisma.candidate.findUnique({ where: { id } });
  if (!before) return;

  // Log first (candidateId becomes null on delete via SetNull), keeping the
  // snapshot in `changes` for the audit trail.
  await prisma.candidateActivityLog.create({
    data: {
      adminId,
      candidateId: id,
      action: "deleted",
      changes: { snapshot: toComparable(before) } as Prisma.InputJsonValue,
    },
  });

  await prisma.candidate.delete({ where: { id } });
  await deleteCandidateDoc(id);
}

/** Bulk status update. Returns count updated. */
export async function bulkUpdateStatus(
  ids: string[],
  status: string,
  adminId: string
): Promise<number> {
  const result = await prisma.candidate.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });

  // Re-index affected docs + log.
  const updated = await prisma.candidate.findMany({ where: { id: { in: ids } } });
  await prisma.candidateActivityLog.createMany({
    data: updated.map((c) => ({
      candidateId: c.id,
      adminId,
      action: "updated",
      changes: { changes: { status: { to: status } } } as Prisma.InputJsonValue,
    })),
  });
  await bulkIndexCandidates(updated);
  return result.count;
}

/** Bulk delete. Returns count deleted. */
export async function bulkDeleteCandidates(ids: string[], adminId: string): Promise<number> {
  const existing = await prisma.candidate.findMany({ where: { id: { in: ids } } });

  await prisma.candidateActivityLog.createMany({
    data: existing.map((c) => ({
      candidateId: c.id,
      adminId,
      action: "deleted",
      changes: { snapshot: toComparable(c) } as Prisma.InputJsonValue,
    })),
  });

  const result = await prisma.candidate.deleteMany({ where: { id: { in: ids } } });

  await Promise.all(ids.map((id) => deleteCandidateDoc(id)));
  return result.count;
}

import type { Candidate } from "@prisma/client";

/** Coerce a Prisma Json field into a clean string[]. */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v)).filter((v) => v.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    // Allow comma-separated strings as a fallback.
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

export interface CandidateView {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  currentEmployer: string | null;
  currentTitle: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  skills: string[];
  tags: string[];
  experienceYears: number | null;
  source: string;
  status: string;
  notes: string | null;
  resumeUrl: string | null;
  resumeText: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Build a human-readable location string from split fields. */
export function locationString(c: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  return [c.city, c.state, c.country].filter(Boolean).join(", ");
}

/** Serialize a Prisma Candidate into a JSON-safe view object for API/UI. */
export function toCandidateView(c: Candidate): CandidateView {
  return {
    id: c.id,
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
    resumeText: c.resumeText,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

/** Build the Elasticsearch document for a candidate. */
export function toEsDoc(c: Candidate): Record<string, unknown> {
  const skills = toStringArray(c.skills);
  const tags = toStringArray(c.tags);
  const fullName = `${c.firstName} ${c.lastName}`.trim();
  const location = locationString(c);

  // Completion suggester inputs: name + individual skills.
  const suggestInputs = [fullName, ...skills].filter(Boolean);

  return {
    firstName: c.firstName,
    lastName: c.lastName,
    fullName,
    email: c.email,
    phone: c.phone ?? null,
    currentEmployer: c.currentEmployer ?? null,
    currentTitle: c.currentTitle ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    country: c.country ?? null,
    location: location || null,
    skills,
    tags,
    experienceYears: c.experienceYears ?? null,
    source: c.source,
    status: c.status,
    notes: c.notes ?? null,
    resumeText: c.resumeText ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    suggest: suggestInputs.length ? { input: suggestInputs } : undefined,
  };
}

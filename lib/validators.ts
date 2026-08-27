import { z } from "zod";

export const CANDIDATE_STATUSES = [
  "Active",
  "Placed",
  "Do Not Contact",
  "Blacklisted",
] as const;

export const CANDIDATE_SOURCES = ["Import", "Manual"] as const;

// Coerce "" -> undefined for optional string fields coming from forms.
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const optionalEmail = z
  .string()
  .trim()
  .email("Invalid email")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

export const candidateInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email("A valid email is required"),
  phone: optionalString,
  currentEmployer: optionalString,
  currentTitle: optionalString,
  city: optionalString,
  state: optionalString,
  country: optionalString,
  skills: z.array(z.string().trim().min(1)).default([]),
  tags: z.array(z.string().trim().min(1)).default([]),
  experienceYears: z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = typeof v === "number" ? v : parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    })
    .refine((v) => v === undefined || (v >= 0 && v <= 70), {
      message: "Experience years must be between 0 and 70",
    }),
  source: z.enum(CANDIDATE_SOURCES).default("Manual"),
  status: z.enum(CANDIDATE_STATUSES).default("Active"),
  notes: optionalString,
  resumeUrl: optionalString,
  resumeText: optionalString,
});

export type CandidateInput = z.infer<typeof candidateInputSchema>;

// Partial schema for PATCH updates.
export const candidateUpdateSchema = candidateInputSchema.partial();
export type CandidateUpdate = z.infer<typeof candidateUpdateSchema>;

// Bulk action payloads.
export const bulkActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updateStatus"),
    ids: z.array(z.string()).min(1),
    status: z.enum(CANDIDATE_STATUSES),
  }),
  z.object({
    action: z.literal("delete"),
    ids: z.array(z.string()).min(1),
  }),
]);
export type BulkAction = z.infer<typeof bulkActionSchema>;

// Column mapping for import: maps a source column header -> a candidate field.
export const CANDIDATE_FIELD_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "currentEmployer",
  "currentTitle",
  "city",
  "state",
  "country",
  "skills",
  "tags",
  "experienceYears",
  "status",
  "notes",
] as const;

export type CandidateFieldKey = (typeof CANDIDATE_FIELD_KEYS)[number];

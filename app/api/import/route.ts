import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { mapRow, processImport } from "@/lib/import-service";
import { CANDIDATE_FIELD_KEYS } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const fieldKeyEnum = z.enum(CANDIDATE_FIELD_KEYS);

// Body: already-parsed tabular rows + a header->field mapping.
// (The file itself is parsed client-side with papaparse/xlsx so the user can
//  preview and map columns before committing.)
const importSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(z.record(z.any())).min(1, "No rows to import"),
  mapping: z.record(fieldKeyEnum.or(z.literal(""))),
});

// POST /api/import — bulk tabular import.
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { fileName, rows, mapping } = importSchema.parse(body);

    // Drop empty mappings, then map every row.
    const cleanMapping = Object.fromEntries(
      Object.entries(mapping).filter(([, v]) => v)
    ) as Record<string, (typeof CANDIDATE_FIELD_KEYS)[number]>;

    const mapped = rows.map((r) => mapRow(r, cleanMapping));
    const summary = await processImport(fileName, mapped, admin.id, { source: "Import" });

    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}

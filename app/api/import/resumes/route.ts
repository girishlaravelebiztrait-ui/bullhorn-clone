import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseResume } from "@/lib/resume-parser";
import { storage } from "@/lib/storage";
import { processImport, type ImportRowResult } from "@/lib/import-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/import/resumes — multipart form with one or more "files" entries.
// Each resume is parsed to text, stored, and turned into a candidate row.
// Resumes with no extractable email are reported as failed (email is required).
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "No resume files provided" }, { status: 400 });
    }

    const rows: Record<string, unknown>[] = [];
    const preFailures: ImportRowResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await parseResume(buffer, file.name, file.type);
        const s = parsed.suggested;

        if (!s.email) {
          preFailures.push({
            rowNumber: i + 1,
            status: "failed",
            reason: `No email found in "${file.name}"`,
          });
          continue;
        }

        // Store the file so we keep a resumeUrl.
        const stored = await storage.save(file.name, buffer);

        rows.push({
          firstName: s.firstName || "Unknown",
          lastName: s.lastName || file.name.replace(/\.[^.]+$/, ""),
          email: s.email,
          phone: s.phone,
          skills: s.skills,
          experienceYears: s.experienceYears,
          resumeUrl: stored.url,
          resumeText: parsed.text,
          source: "Import",
        });
      } catch (err) {
        preFailures.push({
          rowNumber: i + 1,
          status: "failed",
          reason: `Failed to parse "${file.name}": ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        });
      }
    }

    const fileName = `resume-batch-${files.length}-files`;
    const summary = await processImport(fileName, rows, admin.id, { source: "Import" });

    // Merge in the parse-time failures (files that never became rows).
    summary.results.push(...preFailures);
    summary.failedCount += preFailures.length;
    summary.totalRows += preFailures.length;
    summary.results.sort((a, b) => a.rowNumber - b.rowNumber);

    return NextResponse.json(summary);
  } catch (err) {
    return errorResponse(err);
  }
}

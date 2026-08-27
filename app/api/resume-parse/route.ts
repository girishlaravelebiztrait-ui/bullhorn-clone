import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { parseResume } from "@/lib/resume-parser";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Resume parsing (pdf-parse) can take a moment on larger files.
export const maxDuration = 60;

// POST /api/resume-parse — multipart form with a single "file" field.
// Stores the file and returns { resumeUrl, resumeText, suggested }.
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseResume(buffer, file.name, file.type);

    // Persist the file so the URL can be saved on the candidate.
    const stored = await storage.save(file.name, buffer);

    return NextResponse.json({
      resumeUrl: stored.url,
      resumeText: parsed.text,
      suggested: parsed.suggested,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

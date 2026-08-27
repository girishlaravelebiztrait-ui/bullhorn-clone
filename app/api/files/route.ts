import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { requireAdmin } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain; charset=utf-8",
};

// GET /api/files?key=local:xyz.pdf — stream a stored resume file (admin only).
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const key = req.nextUrl.searchParams.get("key");
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

    const data = await storage.read(key);
    const ext = path.extname(key).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${path.basename(key)}"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

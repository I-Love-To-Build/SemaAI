import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireRole } from "@/lib/api";
import { exportSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "exports");
  if (limited) return limited;

  const auth = await requireRole(request, ["ops_admin", "language_lead"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, exportSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("export_manifests")
    .insert({
      name: parsed.data.name,
      language_codes: parsed.data.languageCodes,
      domains: parsed.data.domains,
      minimum_review_score: parsed.data.minimumReviewScore,
      include_audio: parsed.data.includeAudio,
      status: "queued",
      created_by: auth.user.id
    })
    .select("id,status")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await auditEvent(auth.user.id, "export_queued", "export_manifest", data.id, {
    languageCodes: parsed.data.languageCodes,
    includeAudio: parsed.data.includeAudio
  });

  return NextResponse.json(data, { status: 202 });
}

import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { consentSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "consent");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, consentSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("consent_records")
    .insert({
      contributor_id: auth.user.id,
      consent_version: parsed.data.consentVersion,
      allows_training: parsed.data.allowsTraining,
      allows_open_release: parsed.data.allowsOpenRelease
    })
    .select("id,signed_at")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await auditEvent(auth.user.id, "consent_signed", "consent_record", data.id, {
    consentVersion: parsed.data.consentVersion,
    allowsOpenRelease: parsed.data.allowsOpenRelease
  });

  return NextResponse.json(data, { status: 201 });
}

import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { speakerProfileSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "speaker-profiles");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, speakerProfileSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("speaker_profiles")
    .insert({
      contributor_id: auth.user.id,
      language_code: parsed.data.languageCode,
      dialect_id: parsed.data.dialectId ?? null,
      age_band: parsed.data.ageBand ?? null,
      gender: parsed.data.gender ?? null,
      region: parsed.data.region ?? null,
      microphone_type: parsed.data.microphoneType ?? null
    })
    .select("id")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await auditEvent(auth.user.id, "speaker_profile_created", "speaker_profile", data.id, {
    languageCode: parsed.data.languageCode
  });

  return NextResponse.json(data, { status: 201 });
}

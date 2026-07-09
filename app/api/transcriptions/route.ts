import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { transcriptionSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "transcriptions");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, transcriptionSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("transcriptions")
    .insert({
      recording_id: parsed.data.recordingId,
      contributor_id: auth.user.id,
      text: parsed.data.text
    })
    .select("id,status")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await auditEvent(auth.user.id, "transcription_submitted", "transcription", data.id, {
    recordingId: parsed.data.recordingId
  });

  return NextResponse.json(data, { status: 201 });
}

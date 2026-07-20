import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { signedUploadSchema } from "@/lib/contracts";
import { getEnv } from "@/lib/env";

const extensionByType: Record<string, string> = {
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg"
};

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "signed-upload");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, signedUploadSchema);
  if (!parsed.ok) return parsed.response;

  const env = getEnv();
  const extension = extensionByType[parsed.data.contentType];
  const path = `${parsed.data.languageCode}/${auth.user.id}/${parsed.data.corpusItemId}/${randomUUID()}.${extension}`;

  const { data, error } = await auth.supabase.storage
    .from(env.SEMA_AUDIO_BUCKET)
    .createSignedUploadUrl(path);

  if (error) {
    return jsonError(error.message, 500);
  }

  await auditEvent(auth.user.id, "signed_upload_created", "recording_upload", undefined, {
    path,
    byteSize: parsed.data.byteSize,
    contentType: parsed.data.contentType
  });

  return NextResponse.json({
    bucket: env.SEMA_AUDIO_BUCKET,
    path,
    token: data.token,
    signedUrl: data.signedUrl
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, parseJson } from "@/lib/api";
import { logClientUsage, requireClientApiKey } from "@/lib/client-auth";
import { callModelEndpoint, findClientModel } from "@/lib/client-inference";

const clientVoiceSchema = z.object({
  language: z.string().min(2),
  voice: z.string().max(120).optional(),
  domain: z.string().max(80).optional(),
  text: z.string().min(1).max(5000),
  format: z.enum(["audio/mpeg", "audio/wav", "audio/webm"]).default("audio/mpeg")
});

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "client-voice");
  if (limited) return limited;

  const auth = await requireClientApiKey(request, "text_to_speech");
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, clientVoiceSchema);
  if (!parsed.ok) return parsed.response;

  let voiceModel = null;
  if (parsed.data.voice) {
    const { data, error } = await auth.supabase
      .from("voice_models")
      .select("slug,display_name,language_code,tone,readiness_score,status")
      .eq("slug", parsed.data.voice)
      .eq("language_code", parsed.data.language)
      .in("status", ["published", "qa"])
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    voiceModel = data;
  }

  const { model, error } = await findClientModel({
    supabase: auth.supabase,
    modelType: "text_to_speech",
    languageCodes: [parsed.data.language],
    domains: parsed.data.domain ? [parsed.data.domain] : undefined
  });

  if (error) {
    await logClientUsage({
      organizationId: auth.apiKey.organization_id,
      apiKeyId: auth.apiKey.id,
      serviceType: "text_to_speech",
      units: parsed.data.text.length,
      status: "error",
      metadata: { error: error.message }
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logClientUsage({
    organizationId: auth.apiKey.organization_id,
    apiKeyId: auth.apiKey.id,
    serviceType: "text_to_speech",
    units: parsed.data.text.length,
    status: model ? "success" : "error",
    metadata: {
      language: parsed.data.language,
      voice: parsed.data.voice,
      model: model?.slug ?? null
    }
  });

  return callModelEndpoint(model, {
    language: parsed.data.language,
    domain: parsed.data.domain ?? null,
    voice: voiceModel?.slug ?? parsed.data.voice ?? null,
    text: parsed.data.text,
    format: parsed.data.format
  });
}

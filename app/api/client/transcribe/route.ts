import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, parseJson } from "@/lib/api";
import { logClientUsage, requireClientApiKey } from "@/lib/client-auth";
import { callModelEndpoint, findClientModel } from "@/lib/client-inference";

const clientTranscribeSchema = z.object({
  language: z.string().min(2),
  domain: z.string().max(80).optional(),
  audioUrl: z.string().url().optional(),
  storagePath: z.string().min(5).optional(),
  mimeType: z.string().max(80).optional(),
  durationSeconds: z.number().positive().max(7200).optional()
}).refine((value) => value.audioUrl || value.storagePath, {
  message: "Provide either audioUrl or storagePath"
});

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "client-transcribe");
  if (limited) return limited;

  const auth = await requireClientApiKey(request, "speech_to_text");
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, clientTranscribeSchema);
  if (!parsed.ok) return parsed.response;

  const { model, error } = await findClientModel({
    supabase: auth.supabase,
    modelType: "speech_to_text",
    languageCodes: [parsed.data.language],
    domains: parsed.data.domain ? [parsed.data.domain] : undefined
  });

  const units = Math.max(1, Math.ceil(parsed.data.durationSeconds ?? 1));
  if (error) {
    await logClientUsage({
      organizationId: auth.apiKey.organization_id,
      apiKeyId: auth.apiKey.id,
      serviceType: "speech_to_text",
      units,
      status: "error",
      metadata: { error: error.message }
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logClientUsage({
    organizationId: auth.apiKey.organization_id,
    apiKeyId: auth.apiKey.id,
    serviceType: "speech_to_text",
    units,
    status: model ? "success" : "error",
    metadata: {
      language: parsed.data.language,
      domain: parsed.data.domain,
      model: model?.slug ?? null
    }
  });

  return callModelEndpoint(model, {
    language: parsed.data.language,
    domain: parsed.data.domain ?? null,
    audioUrl: parsed.data.audioUrl ?? null,
    storagePath: parsed.data.storagePath ?? null,
    mimeType: parsed.data.mimeType ?? null
  });
}

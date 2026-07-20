import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, parseJson } from "@/lib/api";
import { logClientUsage, requireClientApiKey } from "@/lib/client-auth";

const clientDataIngestSchema = z.object({
  name: z.string().min(3).max(160),
  sourceType: z.enum(["upload", "api", "storage", "partner"]),
  storagePath: z.string().min(5).optional(),
  languageCodes: z.array(z.string().min(2)).min(1),
  domains: z.array(z.string().min(2).max(80)).default([]),
  unitCount: z.number().int().min(1).optional(),
  audioHours: z.number().min(0).optional(),
  consent: z.object({
    allowsTraining: z.boolean(),
    allowsCommercialUse: z.boolean().default(false),
    license: z.string().min(2).max(120)
  }),
  metadata: z.record(z.unknown()).default({})
});

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "client-data");
  if (limited) return limited;

  const auth = await requireClientApiKey(request, "dataset");
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, clientDataIngestSchema);
  if (!parsed.ok) return parsed.response;

  if (!parsed.data.consent.allowsTraining) {
    return NextResponse.json(
      { error: "Client data cannot enter the training pipeline without training consent." },
      { status: 422 }
    );
  }

  const { data, error } = await auth.supabase
    .from("client_data_ingests")
    .insert({
      organization_id: auth.apiKey.organization_id,
      name: parsed.data.name,
      source_type: parsed.data.sourceType,
      storage_path: parsed.data.storagePath ?? null,
      language_codes: parsed.data.languageCodes,
      domains: parsed.data.domains,
      unit_count: parsed.data.unitCount ?? 0,
      audio_hours: parsed.data.audioHours ?? 0,
      consent: parsed.data.consent,
      metadata: parsed.data.metadata,
      status: "queued"
    })
    .select("id,name,status,created_at")
    .single();

  if (error) {
    await logClientUsage({
      organizationId: auth.apiKey.organization_id,
      apiKeyId: auth.apiKey.id,
      serviceType: "dataset",
      units: parsed.data.unitCount ?? 1,
      status: "error",
      metadata: { error: error.message }
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logClientUsage({
    organizationId: auth.apiKey.organization_id,
    apiKeyId: auth.apiKey.id,
    serviceType: "dataset",
    units: parsed.data.unitCount ?? 1,
    status: "success",
    metadata: { ingestId: data.id, languageCodes: parsed.data.languageCodes }
  });

  return NextResponse.json(
    {
      ...data,
      message: "Client data accepted. The automation worker will validate it and create training jobs when quality gates pass."
    },
    { status: 202 }
  );
}

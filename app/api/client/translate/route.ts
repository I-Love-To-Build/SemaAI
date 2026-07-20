import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, parseJson } from "@/lib/api";
import { logClientUsage, requireClientApiKey } from "@/lib/client-auth";
import { callModelEndpoint, findClientModel } from "@/lib/client-inference";

const clientTranslateSchema = z.object({
  source: z.string().min(2),
  target: z.string().min(2),
  domain: z.string().max(80).optional(),
  text: z.string().min(1).max(5000)
});

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "client-translate");
  if (limited) return limited;

  const auth = await requireClientApiKey(request, "translation");
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, clientTranslateSchema);
  if (!parsed.ok) return parsed.response;

  const { model, error } = await findClientModel({
    supabase: auth.supabase,
    modelType: "translation",
    languageCodes: [parsed.data.source, parsed.data.target],
    domains: parsed.data.domain ? [parsed.data.domain] : undefined
  });

  if (error) {
    await logClientUsage({
      organizationId: auth.apiKey.organization_id,
      apiKeyId: auth.apiKey.id,
      serviceType: "translation",
      units: parsed.data.text.length,
      status: "error",
      metadata: { error: error.message }
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logClientUsage({
    organizationId: auth.apiKey.organization_id,
    apiKeyId: auth.apiKey.id,
    serviceType: "translation",
    units: parsed.data.text.length,
    status: model ? "success" : "error",
    metadata: {
      source: parsed.data.source,
      target: parsed.data.target,
      domain: parsed.data.domain,
      model: model?.slug ?? null
    }
  });

  return callModelEndpoint(model, {
    source: parsed.data.source,
    target: parsed.data.target,
    domain: parsed.data.domain ?? null,
    text: parsed.data.text
  });
}

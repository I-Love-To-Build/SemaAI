import { NextResponse } from "next/server";

type InferenceLookupInput = {
  supabase: any;
  modelType: string;
  languageCodes: string[];
  domains?: string[];
  voiceSlug?: string;
};

export async function findClientModel(input: InferenceLookupInput) {
  let query = input.supabase
    .from("model_releases")
    .select("id,slug,name,model_type,version,quality_score,status,endpoint_url,language_codes,domains")
    .eq("model_type", input.modelType)
    .contains("language_codes", input.languageCodes)
    .eq("status", "published")
    .order("quality_score", { ascending: false })
    .limit(1);

  if (input.domains?.length) {
    query = query.overlaps("domains", input.domains);
  }

  const { data, error } = await query.maybeSingle();
  return { model: data, error };
}

export async function callModelEndpoint(model: any, payload: Record<string, unknown>) {
  if (!model) {
    return NextResponse.json(
      {
        status: "not_available",
        message: "No released model is available for this request yet."
      },
      { status: 404 }
    );
  }

  if (!model.endpoint_url) {
    return NextResponse.json(
      {
        status: "model_not_connected",
        model,
        message: "A model release exists, but no inference endpoint is connected yet."
      },
      { status: 503 }
    );
  }

  const response = await fetch(model.endpoint_url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: process.env.SEMA_MODEL_GATEWAY_TOKEN ? `Bearer ${process.env.SEMA_MODEL_GATEWAY_TOKEN}` : ""
    },
    body: JSON.stringify({ ...payload, model: model.slug })
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "inference_error",
        model,
        message: "The model endpoint did not return a successful response."
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    status: "success",
    model,
    output: await response.json()
  });
}

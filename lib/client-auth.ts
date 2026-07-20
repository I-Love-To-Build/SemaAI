import { createHash } from "crypto";
import { jsonError } from "./api";
import { getServiceSupabase } from "./supabase";

export function hashClientApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export async function requireClientApiKey(request: Request, serviceType?: string) {
  const apiKey = request.headers.get("x-sema-api-key")?.trim();

  if (!apiKey) {
    return { ok: false as const, response: jsonError("Client API key required", 401) };
  }

  const supabase = getServiceSupabase();
  const keyHash = hashClientApiKey(apiKey);
  const { data: keyRow, error } = await supabase
    .from("client_api_keys")
    .select("id,organization_id,name,scopes,status,expires_at")
    .eq("key_hash", keyHash)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    return { ok: false as const, response: jsonError(error.message, 500) };
  }

  if (!keyRow) {
    return { ok: false as const, response: jsonError("Invalid client API key", 401) };
  }

  if (keyRow.expires_at && Date.parse(keyRow.expires_at) < Date.now()) {
    return { ok: false as const, response: jsonError("Client API key expired", 401) };
  }

  if (serviceType && Array.isArray(keyRow.scopes) && !keyRow.scopes.includes(serviceType) && !keyRow.scopes.includes("*")) {
    return { ok: false as const, response: jsonError("API key is not allowed to use this service", 403) };
  }

  if (serviceType) {
    const { data: subscription, error: subscriptionError } = await supabase
      .from("client_service_subscriptions")
      .select("id,status,monthly_quota,used_this_month")
      .eq("organization_id", keyRow.organization_id)
      .eq("service_type", serviceType)
      .in("status", ["active", "trial"])
      .maybeSingle();

    if (subscriptionError) {
      return { ok: false as const, response: jsonError(subscriptionError.message, 500) };
    }

    if (!subscription) {
      return { ok: false as const, response: jsonError("No active subscription for this service", 403) };
    }

    if (subscription.monthly_quota && subscription.used_this_month >= subscription.monthly_quota) {
      return { ok: false as const, response: jsonError("Monthly quota exceeded", 429) };
    }
  }

  await supabase
    .from("client_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return { ok: true as const, supabase, apiKey: keyRow };
}

export async function logClientUsage(input: {
  organizationId: string;
  apiKeyId: string;
  serviceType: string;
  units: number;
  status: "success" | "error";
  metadata?: Record<string, unknown>;
}) {
  const supabase = getServiceSupabase();
  await supabase.from("client_usage_events").insert({
    organization_id: input.organizationId,
    api_key_id: input.apiKeyId,
    service_type: input.serviceType,
    units: input.units,
    status: input.status,
    metadata: input.metadata ?? {}
  });
  await supabase.rpc("increment_client_subscription_usage", {
    target_org_id: input.organizationId,
    target_service_type: input.serviceType,
    increment_by: input.units
  });
}

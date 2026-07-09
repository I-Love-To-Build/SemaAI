import { NextResponse } from "next/server";
import { z } from "zod";
import { getServiceSupabase } from "./supabase";

export type AuthenticatedUser = {
  id: string;
  email?: string;
};

const windowMs = 60_000;
const maxRequests = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return { ok: false as const, response: jsonError("Invalid JSON body", 400) };
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError("Validation failed", 400, parsed.error.flatten())
    };
  }

  return { ok: true as const, data: parsed.data };
}

export function checkRateLimit(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${scope}:${forwarded || "local"}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;

  if (bucket.count > maxRequests) {
    return jsonError("Too many requests. Please slow down and try again.", 429);
  }

  return null;
}

export async function requireUser(request: Request) {
  const auth = request.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token) {
    return { ok: false as const, response: jsonError("Authentication required", 401) };
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return { ok: false as const, response: jsonError("Invalid or expired session", 401) };
  }

  return {
    ok: true as const,
    user: { id: data.user.id, email: data.user.email ?? undefined },
    supabase
  };
}

export async function requireRole(request: Request, roles: string[]) {
  const auth = await requireUser(request);

  if (!auth.ok) {
    return auth;
  }

  const { data, error } = await auth.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .in("role", roles);

  if (error) {
    return { ok: false as const, response: jsonError(error.message, 500) };
  }

  if (!data?.length) {
    return { ok: false as const, response: jsonError("Insufficient permissions", 403) };
  }

  return auth;
}

export async function auditEvent(
  actorId: string,
  action: string,
  targetType: string,
  targetId?: string,
  metadata: Record<string, unknown> = {}
) {
  const supabase = getServiceSupabase();
  await supabase.from("audit_events").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata
  });
}

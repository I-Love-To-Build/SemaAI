import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, parseJson, requireUser, auditEvent } from "@/lib/api";
import { profileSchema } from "@/lib/contracts";

export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("profiles")
    .select("id,display_name,home_language_code,county,reviewer_score,payout_method,payout_phone,payout_name,payout_notes,payout_opt_in,created_at,updated_at,user_roles(role,language_code),consent_records(id,signed_at),speaker_profiles(id,language_code,created_at)")
    .eq("id", auth.user.id)
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const limited = checkRateLimit(request, "profile");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, profileSchema);
  if (!parsed.ok) return parsed.response;

  const { error: profileError } = await auth.supabase.from("profiles").upsert({
    id: auth.user.id,
    display_name: parsed.data.displayName,
    home_language_code: parsed.data.homeLanguageCode ?? parsed.data.languages[0],
    county: parsed.data.county ?? null,
    payout_method: parsed.data.payoutMethod,
    payout_phone: parsed.data.payoutPhone?.trim() || null,
    payout_name: parsed.data.payoutName?.trim() || null,
    payout_notes: parsed.data.payoutNotes?.trim() || null,
    payout_opt_in: parsed.data.payoutOptIn,
    updated_at: new Date().toISOString()
  });

  if (profileError) {
    return jsonError(profileError.message, 500);
  }

  const roles = parsed.data.languages.map((languageCode) => ({
    user_id: auth.user.id,
    role: "contributor",
    language_code: languageCode
  }));

  const { error: roleError } = await auth.supabase.from("user_roles").upsert(roles);

  if (roleError) {
    return jsonError(roleError.message, 500);
  }

  await auditEvent(auth.user.id, "profile_updated", "profile", auth.user.id, {
    languageCount: parsed.data.languages.length,
    payoutMethod: parsed.data.payoutMethod,
    payoutOptIn: parsed.data.payoutOptIn
  });

  return NextResponse.json({ ok: true });
}

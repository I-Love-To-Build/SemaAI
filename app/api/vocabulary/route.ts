import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, requireUser } from "@/lib/api";

const unitTypes = ["word", "phrase", "sentence", "term", "idiom", "proverb"] as const;

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "vocabulary");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const source = url.searchParams.get("source") || "en";
  const unitType = url.searchParams.get("type") || "word";
  const domain = url.searchParams.get("domain") || "";
  const q = url.searchParams.get("q")?.trim() || "";
  const target = url.searchParams.get("target") || "";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 60));

  if (!["en", "sw"].includes(source)) return jsonError("Source language must be English or Kiswahili.");
  if (unitType !== "all" && !unitTypes.includes(unitType as (typeof unitTypes)[number])) {
    return jsonError("Unsupported corpus unit type.");
  }

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("home_language_code")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) return jsonError(profileError.message, 500);
  const targetLanguage = target || profile?.home_language_code || "";

  let completedIds: string[] = [];
  if (targetLanguage) {
    const { data: completed, error: completedError } = await auth.supabase
      .from("translations")
      .select("corpus_item_id")
      .eq("contributor_id", auth.user.id)
      .eq("language_code", targetLanguage)
      .in("status", ["submitted", "peer_review", "expert_review", "approved", "exported"])
      .limit(5000);

    if (completedError) return jsonError(completedError.message, 500);
    completedIds = [...new Set((completed ?? []).map((item) => item.corpus_item_id).filter(Boolean))];
  }

  let query = auth.supabase
    .from("corpus_items")
    .select("id,language_code,text,domain,difficulty,status,metadata,created_at", { count: "exact" })
    .eq("language_code", source)
    .in("status", ["draft", "needs_revision", "approved"])
    .limit(limit);

  if (unitType !== "all") query = query.contains("metadata", { unit_type: unitType });
  if (domain) query = query.eq("domain", domain);
  if (q) query = query.ilike("text", `%${q}%`);
  if (completedIds.length) query = query.not("id", "in", `(${completedIds.join(",")})`);
  if (!q && unitType === "word") {
    query = query
      .gte("text", "A")
      .not("text", "like", "-%")
      .not("text", "like", "%-")
      .not("metadata->>pos", "in", "(character,circumfix,infix,interfix,prefix,punctuation,suffix,symbol)");
  }
  query = q ? query.order("text", { ascending: true }) : query.order("created_at", { ascending: true });

  const { data, error, count } = await query;
  if (error) return jsonError(error.message, 500);

  return NextResponse.json(
    { count: count ?? 0, items: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}

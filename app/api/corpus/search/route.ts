import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { searchSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "corpus-search");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, searchSchema);
  if (!parsed.ok) return parsed.response;

  let query = auth.supabase
    .from("corpus_items")
    .select("id,language_code,text,domain,difficulty,status,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(parsed.data.limit ?? 25);

  if (parsed.data.q) query = query.ilike("text", `%${parsed.data.q}%`);
  if (parsed.data.languageCode) query = query.eq("language_code", parsed.data.languageCode);
  if (parsed.data.domain) query = query.eq("domain", parsed.data.domain);
  if (parsed.data.status) query = query.eq("status", parsed.data.status);

  const { data, error, count } = await query;

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ count, items: data ?? [] });
}

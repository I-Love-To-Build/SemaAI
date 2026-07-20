import { NextResponse } from "next/server";
import { checkRateLimit, jsonError, requireUser } from "@/lib/api";
import { refreshContributorReputation } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "reputation");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  try {
    const reputation = await refreshContributorReputation(auth.supabase, auth.user.id);
    return NextResponse.json(reputation, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not calculate reputation.", 500);
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, jsonError, parseJson, requireRole, requireUser } from "@/lib/api";

export const dynamic = "force-dynamic";

const missionSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/),
  title: z.string().min(3).max(160),
  description: z.string().min(10).max(1000),
  domain: z.string().min(2).max(80),
  languageCodes: z.array(z.string().min(2)).min(1),
  targetItems: z.number().int().min(1).max(1_000_000),
  status: z.enum(["draft", "active", "paused", "completed", "archived"]).default("active"),
  priority: z.number().int().min(0).max(100).default(50),
  governanceNotes: z.string().max(2000).optional()
});

async function missionProgress(supabase: any, mission: any) {
  const languageCodes = Array.isArray(mission.language_codes) ? mission.language_codes : [];
  if (!languageCodes.length) {
    return { approvedItems: 0, progress: 0 };
  }
  const [translations, recordings] = await Promise.all([
    supabase
      .from("translations")
      .select("*", { count: "exact", head: true })
      .in("language_code", languageCodes)
      .eq("status", "approved"),
    supabase
      .from("recordings")
      .select("*", { count: "exact", head: true })
      .in("language_code", languageCodes)
      .eq("status", "approved")
  ]);
  return {
    approvedItems: (translations.count ?? 0) + (recordings.count ?? 0),
    progress: Math.min(100, Math.round((((translations.count ?? 0) + (recordings.count ?? 0)) / Math.max(1, mission.target_items)) * 100))
  };
}

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "missions");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("missions")
    .select("*")
    .in("status", ["active", "completed"])
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return jsonError(error.message, 500);

  const missions = await Promise.all((data ?? []).map(async (mission) => ({
    ...mission,
    ...(await missionProgress(auth.supabase, mission))
  })));

  return NextResponse.json({ missions }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "missions-admin");
  if (limited) return limited;

  const auth = await requireRole(request, ["ops_admin", "language_lead"]);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, missionSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("missions")
    .upsert({
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description,
      domain: parsed.data.domain,
      language_codes: parsed.data.languageCodes,
      target_items: parsed.data.targetItems,
      status: parsed.data.status,
      priority: parsed.data.priority,
      governance_notes: parsed.data.governanceNotes ?? null,
      created_by: auth.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict: "slug" })
    .select("*")
    .single();

  if (error) return jsonError(error.message, 500);
  return NextResponse.json(data, { status: 201 });
}

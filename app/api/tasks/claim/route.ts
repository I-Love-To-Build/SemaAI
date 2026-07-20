import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { taskClaimSchema } from "@/lib/contracts";

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

type CandidateTask = {
  id: string;
  language_code: string;
  text: string;
  domain: string;
  difficulty: string;
  status: string;
};

const claimableCorpusStatusFilter = "status.eq.draft,status.eq.approved,status.eq.needs_revision";
const unavailableTranslationStatusFilter = "status.eq.submitted,status.eq.peer_review,status.eq.expert_review,status.eq.approved,status.eq.exported";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "task-claim");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, taskClaimSchema);
  if (!parsed.ok) return parsed.response;
  const limit = parsed.data.limit ?? 10;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("home_language_code")
    .eq("id", auth.user.id)
    .single();

  if (profileError) return jsonError(profileError.message, 500);

  if (parsed.data.taskType === "translation" && profile?.home_language_code !== parsed.data.languageCode) {
    const { data: elevatedRoles, error: roleError } = await auth.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id)
      .in("role", ["reviewer", "expert", "language_lead", "ops_admin"]);

    if (roleError) return jsonError(roleError.message, 500);
    if (!elevatedRoles?.length) {
      return jsonError("Your account is approved for one contribution language. Ask an administrator for multilingual access.", 403);
    }
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await auth.supabase
    .from("task_claims")
    .update({ status: "expired" })
    .eq("contributor_id", auth.user.id)
    .eq("task_type", parsed.data.taskType)
    .eq("status", "claimed")
    .lt("expires_at", nowIso);

  await auth.supabase
    .from("task_claims")
    .update({ status: "released" })
    .eq("contributor_id", auth.user.id)
    .eq("task_type", parsed.data.taskType)
    .eq("status", "claimed")
    .gt("expires_at", nowIso);

  let unavailableIds: string[] = [];
  if (parsed.data.taskType === "translation") {
    const completed = await auth.supabase
      .from("translations")
      .select("corpus_item_id")
      .eq("contributor_id", auth.user.id)
      .eq("language_code", parsed.data.languageCode)
      .or(unavailableTranslationStatusFilter)
      .limit(20000);

    if (completed.error) return jsonError(completed.error.message, 500);
    unavailableIds = [
      ...new Set([
        ...(completed.data ?? []).map((item) => item.corpus_item_id).filter(Boolean)
      ])
    ];
  }

  const unavailable = new Set(unavailableIds);
  const tasks: CandidateTask[] = [];
  const batchSize = 250;
  const maxScanned = 5000;

  for (let start = 0; start < maxScanned && tasks.length < limit; start += batchSize) {
    let query = auth.supabase
      .from("corpus_items")
      .select("id,language_code,text,domain,difficulty,status")
      .or(claimableCorpusStatusFilter)
      .order("created_at", { ascending: false })
      .range(start, start + batchSize - 1);

    if (parsed.data.taskType === "translation") {
      query = query.eq("language_code", parsed.data.sourceLanguageCode);
    } else if (parsed.data.taskType === "recording" || parsed.data.taskType === "transcription" || parsed.data.taskType === "review") {
      query = query.eq("language_code", parsed.data.languageCode);
    }

    if (parsed.data.domain) {
      query = query.eq("domain", parsed.data.domain);
    }

    const { data: candidates, error } = await query;
    if (error) return jsonError(error.message, 500);
    if (!candidates?.length) break;

    const fresh = shuffle(candidates.filter((task) => !unavailable.has(task.id)));
    for (const task of fresh) {
      if (tasks.length >= limit) break;
      tasks.push(task);
      unavailable.add(task.id);
    }
  }

  if (!tasks?.length) {
    return NextResponse.json({ tasks: [] });
  }

  const claims = tasks.map((task) => ({
    corpus_item_id: task.id,
    contributor_id: auth.user.id,
    task_type: parsed.data.taskType,
    status: "claimed",
    claimed_at: nowIso,
    expires_at: expiresAt
  }));

  const { error: claimError } = await auth.supabase.from("task_claims").upsert(claims, {
    onConflict: "corpus_item_id,contributor_id,task_type"
  });

  if (claimError) {
    return jsonError(claimError.message, 500);
  }

  await auditEvent(auth.user.id, "tasks_claimed", "task_claim", undefined, {
    count: claims.length,
    languageCode: parsed.data.languageCode,
    taskType: parsed.data.taskType
  });

  return NextResponse.json({
    tasks,
    diagnostics: {
      sourceLanguageCode: parsed.data.sourceLanguageCode,
      languageCode: parsed.data.languageCode,
      domain: parsed.data.domain ?? null,
      unavailableCount: unavailableIds.length,
      expiresAt
    }
  });
}

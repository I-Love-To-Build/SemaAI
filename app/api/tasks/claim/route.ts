import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { taskClaimSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "task-claim");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, taskClaimSchema);
  if (!parsed.ok) return parsed.response;
  const limit = parsed.data.limit ?? 10;

  let query = auth.supabase
    .from("corpus_items")
    .select("id,language_code,text,domain,difficulty,status")
    .in("status", ["draft", "needs_revision"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (parsed.data.taskType === "translation") {
    query = query.eq("language_code", parsed.data.sourceLanguageCode);
  } else if (parsed.data.taskType === "recording" || parsed.data.taskType === "transcription" || parsed.data.taskType === "review") {
    query = query.eq("language_code", parsed.data.languageCode);
  }

  if (parsed.data.domain) {
    query.eq("domain", parsed.data.domain);
  }

  const { data: tasks, error } = await query;

  if (error) {
    return jsonError(error.message, 500);
  }

  if (!tasks?.length) {
    return NextResponse.json({ tasks: [] });
  }

  const claims = tasks.map((task) => ({
    corpus_item_id: task.id,
    contributor_id: auth.user.id,
    task_type: parsed.data.taskType,
    status: "claimed"
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

  return NextResponse.json({ tasks });
}

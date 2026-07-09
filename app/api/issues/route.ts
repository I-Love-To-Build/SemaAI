import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, jsonError, parseJson, requireUser } from "@/lib/api";
import { issueReportSchema } from "@/lib/contracts";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "issues");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, issueReportSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await auth.supabase
    .from("issue_reports")
    .insert({
      reporter_id: auth.user.id,
      target_type: parsed.data.targetType,
      target_id: parsed.data.targetId ?? null,
      severity: parsed.data.severity,
      issue_type: parsed.data.issueType,
      description: parsed.data.description
    })
    .select("id,status")
    .single();

  if (error) {
    return jsonError(error.message, 500);
  }

  await auditEvent(auth.user.id, "issue_reported", "issue_report", data.id, {
    severity: parsed.data.severity,
    issueType: parsed.data.issueType
  });

  return NextResponse.json(data, { status: 201 });
}

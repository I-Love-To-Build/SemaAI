import { NextResponse } from "next/server";
import { auditEvent, checkRateLimit, parseJson, requireUser } from "@/lib/api";
import { monitoringEventSchema } from "@/lib/contracts";
import { monitor } from "@/lib/monitoring";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, "monitoring");
  if (limited) return limited;

  const auth = await requireUser(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseJson(request, monitoringEventSchema);
  if (!parsed.ok) return parsed.response;

  await monitor(parsed.data.level, parsed.data.event, {
    ...parsed.data.metadata,
    userId: auth.user.id
  });

  await auditEvent(auth.user.id, "client_monitoring_event", "monitoring_event", undefined, {
    level: parsed.data.level,
    event: parsed.data.event
  });

  return NextResponse.json({ ok: true });
}

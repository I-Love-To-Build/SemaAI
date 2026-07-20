import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/api";
import { getClientCatalog } from "@/lib/client-platform";

export async function GET(request: Request) {
  const limited = checkRateLimit(request, "client-catalog");
  if (limited) return limited;

  const catalog = await getClientCatalog();
  return NextResponse.json(catalog);
}

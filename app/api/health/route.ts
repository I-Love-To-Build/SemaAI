import { NextResponse } from "next/server";
import { LANGUAGES } from "@/lib/languages";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sema-contributor-platform",
    languageCount: LANGUAGES.length,
    corpusTarget: 1200000,
    audioSeedTarget: 2400000
  });
}

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { getAdminClient } from "./supabase-admin.mjs";

const domainMap = new Map([
  ["medicine", "health"],
  ["medical", "health"],
  ["health", "health"],
  ["agriculture", "agriculture"],
  ["education", "education"],
  ["finance", "finance"],
  ["banking", "finance"],
  ["law", "public services"],
  ["government", "public services"],
  ["transport", "transport"],
  ["climate", "climate"],
  ["weather", "climate"],
  ["commerce", "commerce"],
  ["business", "commerce"],
  ["culture", "culture"]
]);

const allowedDomains = new Set([
  "health",
  "agriculture",
  "education",
  "finance",
  "public services",
  "climate",
  "commerce",
  "transport",
  "culture",
  "everyday conversation"
]);

const posToUnitType = new Map([
  ["phrase", "phrase"],
  ["proverb", "proverb"],
  ["idiom", "idiom"],
  ["prep_phrase", "phrase"],
  ["adv_phrase", "phrase"],
  ["name", "term"],
  ["proper_noun", "term"]
]);

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=") || "true"];
  })
);

if (args.help || !args.source || !args.language) {
  console.log(`Usage:
  node scripts/import-kaikki-corpus.mjs --source=<url-or-file> --language=<code> [options]

Options:
  --name=<import name>             Display name for corpus_imports
  --max=<number>                   Stop after importing this many unique rows
  --batch=<number>                 Upsert batch size, default 1000
  --domain=<domain>                Force one platform domain
  --license=<license text>         Default: Wiktionary CC BY-SA/GFDL via kaikki.org
  --source-uri=<uri>               Stored source URI, defaults to --source

Examples:
  npm run import:kaikki -- --source=https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl --language=en --max=50000
  npm run import:kaikki -- --source=https://kaikki.org/dictionary/Swahili/kaikki.org-dictionary-Swahili.jsonl --language=sw --max=25000
`);
  process.exit(args.help ? 0 : 1);
}

if (args.domain && !allowedDomains.has(args.domain)) {
  console.error(`Invalid domain "${args.domain}".`);
  process.exit(1);
}

const supabase = getAdminClient();
const batchSize = Number.parseInt(args.batch ?? "1000", 10);
const maxItems = args.max ? Number.parseInt(args.max, 10) : Number.POSITIVE_INFINITY;
const importName = args.name ?? `Kaikki Wiktionary import ${args.language}`;
const sourceUri = args["source-uri"] ?? args.source;
const license = args.license ?? "Wiktionary CC BY-SA/GFDL via kaikki.org";

const { data: importRow, error: importError } = await supabase
  .from("corpus_imports")
  .insert({
    name: importName,
    source_type: args.source.startsWith("http") ? "api" : "upload",
    item_count: 0,
    status: "processing"
  })
  .select("id")
  .single();

if (importError) throw importError;

let imported = 0;
let seen = 0;
let skipped = 0;
let rows = [];
const rowKeys = new Set();

try {
  const input = await openSource(args.source);
  const lines = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of lines) {
    if (!line.trim()) continue;
    seen += 1;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      skipped += 1;
      continue;
    }

    const row = toCorpusRow(entry, {
      importId: importRow.id,
      languageCode: args.language,
      forcedDomain: args.domain,
      license,
      sourceUri
    });

    if (!row) {
      skipped += 1;
      continue;
    }

    const rowKey = `${row.language_code}:${row.text.trim().toLowerCase()}`;
    if (rowKeys.has(rowKey)) {
      skipped += 1;
      continue;
    }
    rowKeys.add(rowKey);

    rows.push(row);
    if (rows.length >= batchSize) {
      imported += await upsertRows(rows);
      rows = [];
      console.log(`Imported ${imported.toLocaleString()} rows after scanning ${seen.toLocaleString()} JSONL entries...`);
    }

    if (imported + rows.length >= maxItems) break;
  }

  if (rows.length) imported += await upsertRows(rows);

  const { error: doneError } = await supabase
    .from("corpus_imports")
    .update({ status: "completed", item_count: imported })
    .eq("id", importRow.id);

  if (doneError) throw doneError;

  console.log(`Completed ${importName}: imported ${imported.toLocaleString()}, scanned ${seen.toLocaleString()}, skipped ${skipped.toLocaleString()}.`);
} catch (error) {
  await supabase.from("corpus_imports").update({ status: "failed", item_count: imported }).eq("id", importRow.id);
  throw error;
}

async function openSource(source) {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok || !response.body) {
      throw new Error(`Could not download ${source}: ${response.status} ${response.statusText}`);
    }
    const stream = Readable.fromWeb(response.body);
    return source.endsWith(".gz") ? stream.pipe(createGunzip()) : stream;
  }

  const stream = createReadStream(source);
  return source.endsWith(".gz") ? stream.pipe(createGunzip()) : stream;
}

function toCorpusRow(entry, options) {
  const text = String(entry.word ?? "").trim();
  if (!text || text.length > 5000) return null;
  if (entry.lang_code && entry.lang_code !== options.languageCode) return null;

  const unitType = inferUnitType(text, entry.pos);
  const domain = options.forcedDomain ?? inferDomain(entry);
  const difficulty = inferDifficulty(text, entry);

  return {
    import_id: options.importId,
    language_code: options.languageCode,
    source_language_code: null,
    text,
    domain,
    license: options.license,
    source_uri: options.sourceUri,
    difficulty,
    metadata: {
      unit_type: unitType,
      source: "kaikki",
      pos: entry.pos ?? null,
      lang: entry.lang ?? null,
      lang_code: entry.lang_code ?? options.languageCode,
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 20) : [],
      categories: Array.isArray(entry.categories) ? entry.categories.slice(0, 20) : [],
      sense_count: Array.isArray(entry.senses) ? entry.senses.length : 0
    },
    status: "draft"
  };
}

function inferUnitType(text, pos) {
  if (posToUnitType.has(pos)) return posToUnitType.get(pos);
  if (/\s/.test(text)) return "phrase";
  return "word";
}

function inferDomain(entry) {
  const candidates = [
    ...(Array.isArray(entry.categories) ? entry.categories : []),
    ...(Array.isArray(entry.topics) ? entry.topics : []),
    ...(Array.isArray(entry.senses) ? entry.senses.flatMap((sense) => sense.topics ?? sense.categories ?? []) : [])
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate).toLowerCase();
    for (const [needle, domain] of domainMap) {
      if (normalized.includes(needle)) return domain;
    }
  }

  return "everyday conversation";
}

function inferDifficulty(text, entry) {
  const senseCount = Array.isArray(entry.senses) ? entry.senses.length : 0;
  if (text.length > 80 || senseCount > 8) return "advanced";
  if (text.length > 35 || senseCount > 3) return "intermediate";
  return "beginner";
}

async function upsertRows(nextRows) {
  const { error } = await supabase.from("corpus_items").upsert(nextRows, {
    onConflict: "language_code,hash",
    ignoreDuplicates: false
  });
  if (error) throw error;
  return nextRows.length;
}

import { getAdminClient } from "./supabase-admin.mjs";

const supabase = getAdminClient();
const targetPerSourceLanguage = Number(process.env.SEMA_PILOT_CORPUS_COUNT || "5000");

const domains = {
  health: [
    "Where can I get treatment for {need}?",
    "The patient needs help with {need}.",
    "Please explain the medicine for {need}.",
    "The clinic should record the case of {need}."
  ],
  agriculture: [
    "The farmer is checking {need} today.",
    "How do we protect the crop from {need}?",
    "The extension officer explained {need}.",
    "The market price changed because of {need}."
  ],
  education: [
    "The teacher explained {need} to the class.",
    "The student asked a question about {need}.",
    "Please read the lesson on {need}.",
    "The school meeting discussed {need}."
  ],
  finance: [
    "Please confirm the payment for {need}.",
    "The customer asked about {need}.",
    "The account balance changed after {need}.",
    "How much should we save for {need}?"
  ],
  "public services": [
    "Where can I report {need}?",
    "The county office gave instructions about {need}.",
    "Please help me complete the form for {need}.",
    "The officer asked for details about {need}."
  ],
  climate: [
    "The community prepared for {need}.",
    "The rain affected {need}.",
    "The warning message mentioned {need}.",
    "Please share updates about {need}."
  ],
  commerce: [
    "How much is {need} in the market?",
    "The shopkeeper sold {need}.",
    "Please write a receipt for {need}.",
    "The customer returned {need}."
  ],
  culture: [
    "The elders explained the meaning of {need}.",
    "The story teaches children about {need}.",
    "The ceremony included {need}.",
    "Please record the phrase about {need}."
  ],
  "everyday conversation": [
    "Can you help me with {need}?",
    "I want to understand {need}.",
    "Please say {need} slowly.",
    "We talked about {need} yesterday."
  ]
};

const concepts = [
  "water", "food", "home", "school", "hospital", "market", "road", "family", "work", "money",
  "phone", "message", "rain", "harvest", "medicine", "doctor", "teacher", "student", "form", "receipt",
  "identity card", "birth certificate", "mobile money", "savings", "loan", "seed", "fertilizer", "maize",
  "beans", "milk", "clinic", "nurse", "fever", "cough", "pregnancy", "emergency", "bus fare", "county office",
  "weather alert", "flood", "drought", "meeting", "ceremony", "song", "proverb", "language", "voice", "translation"
];

const swahiliConcepts = [
  "maji", "chakula", "nyumbani", "shule", "hospitali", "soko", "barabara", "familia", "kazi", "pesa",
  "simu", "ujumbe", "mvua", "mavuno", "dawa", "daktari", "mwalimu", "mwanafunzi", "fomu", "risiti",
  "kitambulisho", "cheti cha kuzaliwa", "pesa kwa simu", "akiba", "mkopo", "mbegu", "mbolea", "mahindi",
  "maharagwe", "maziwa", "kliniki", "muuguzi", "homa", "kikohozi", "ujauzito", "dharura", "nauli", "ofisi ya kaunti",
  "tahadhari ya hali ya hewa", "mafuriko", "ukame", "mkutano", "sherehe", "wimbo", "methali", "lugha", "sauti", "tafsiri"
];

function makeRows(languageCode, conceptList, count, importId) {
  const domainNames = Object.keys(domains);
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const domain = domainNames[index % domainNames.length];
    const templates = domains[domain];
    const template = templates[Math.floor(index / domainNames.length) % templates.length];
    const concept = conceptList[index % conceptList.length];
    rows.push({
      import_id: importId,
      language_code: languageCode,
      text: template.replace("{need}", concept),
      domain,
      license: "Sema pilot generated source - replace with licensed corpus for production release",
      difficulty: index % 11 === 0 ? "advanced" : index % 5 === 0 ? "intermediate" : "beginner",
      metadata: {
        seed: true,
        pilot: true,
        unit_type: "sentence",
        generation_batch: "pilot-domain-balanced-v1",
        release_restriction: "pilot_only"
      },
      status: "draft"
    });
  }
  return rows;
}

const total = targetPerSourceLanguage * 2;
const { data: importRow, error: importError } = await supabase
  .from("corpus_imports")
  .insert({
    name: `Sema pilot domain-balanced corpus ${new Date().toISOString()}`,
    source_type: "manual",
    item_count: total,
    status: "queued"
  })
  .select("id")
  .single();

if (importError) throw importError;

const rows = [
  ...makeRows("en", concepts, targetPerSourceLanguage, importRow.id),
  ...makeRows("sw", swahiliConcepts, targetPerSourceLanguage, importRow.id)
];

for (let start = 0; start < rows.length; start += 1000) {
  const batch = rows.slice(start, start + 1000);
  const { error } = await supabase.from("corpus_items").upsert(batch, {
    onConflict: "language_code,hash",
    ignoreDuplicates: false
  });
  if (error) throw error;
  console.log(`Seeded ${Math.min(start + batch.length, rows.length)} / ${rows.length}`);
}

await supabase.from("corpus_imports").update({ status: "processed" }).eq("id", importRow.id);
console.log(`Seeded ${rows.length} pilot corpus items across English and Kiswahili sources.`);

import { getAdminClient } from "./supabase-admin.mjs";

const supabase = getAdminClient();
const seedItems = [
  ["Where is the nearest hospital?", "health"],
  ["I need clean drinking water.", "health"],
  ["The child has a fever.", "health"],
  ["Please call a nurse now.", "health"],
  ["The medicine should be taken after food.", "health"],
  ["How much is the fare to town?", "transport"],
  ["The bus leaves in the morning.", "transport"],
  ["Please stop at the next stage.", "transport"],
  ["The road is flooded after heavy rain.", "climate"],
  ["The weather has changed this week.", "climate"],
  ["The farmer planted maize before the rain.", "agriculture"],
  ["The cow has not eaten since morning.", "agriculture"],
  ["Keep fertilizer away from children.", "agriculture"],
  ["The teacher asked the class to read aloud.", "education"],
  ["My daughter needs help with homework.", "education"],
  ["The school meeting begins at nine.", "education"],
  ["I want to open a savings account.", "finance"],
  ["Please confirm the mobile money payment.", "finance"],
  ["How much did you receive?", "finance"],
  ["The market is busy today.", "commerce"],
  ["How much is one kilogram of maize flour?", "commerce"],
  ["Please write the total amount on the receipt.", "commerce"],
  ["Please help me fill this county form.", "public services"],
  ["Where can I collect my identity card?", "public services"],
  ["The public meeting has moved to Friday.", "public services"],
  ["Please send the message again.", "everyday conversation"],
  ["I do not understand.", "everyday conversation"],
  ["Can you repeat that slowly?", "everyday conversation"],
  ["My grandmother is resting inside the house.", "everyday conversation"],
  ["We will meet at home in the evening.", "everyday conversation"],
  ["The elders will speak before the ceremony begins.", "culture"],
  ["Please explain the meaning of that proverb.", "culture"],
  ["This song is usually sung during harvest time.", "culture"],
  ["My phone battery is almost empty.", "everyday conversation"],
  ["The network is weak in this village.", "everyday conversation"],
  ["Can you help me change the password?", "everyday conversation"],
  ["I want to report the matter at the police station.", "public services"],
  ["Please read the statement before signing.", "public services"],
  ["I need someone to explain my rights.", "public services"],
  ["The witness will speak after the officer arrives.", "public services"]
];

const englishWords = [
  "I", "you", "we", "they", "he", "she", "person", "child", "mother", "father",
  "family", "friend", "home", "house", "water", "food", "fire", "road", "market", "school",
  "hospital", "teacher", "student", "doctor", "nurse", "farmer", "work", "money", "phone", "message",
  "name", "language", "word", "voice", "day", "night", "morning", "evening", "today", "tomorrow",
  "yesterday", "here", "there", "inside", "outside", "near", "far", "big", "small", "good",
  "bad", "new", "old", "hot", "cold", "happy", "sad", "yes", "no", "please",
  "thank you", "help", "come", "go", "eat", "drink", "speak", "listen", "read", "write",
  "see", "know", "understand", "want", "need", "give", "take", "buy", "sell", "pay"
];

const kiswahiliWords = [
  "mimi", "wewe", "sisi", "wao", "yeye", "mtu", "mtoto", "mama", "baba", "familia",
  "rafiki", "nyumbani", "nyumba", "maji", "chakula", "moto", "barabara", "soko", "shule", "hospitali",
  "mwalimu", "mwanafunzi", "daktari", "muuguzi", "mkulima", "kazi", "pesa", "simu", "ujumbe", "jina",
  "lugha", "neno", "sauti", "siku", "usiku", "asubuhi", "jioni", "leo", "kesho", "jana",
  "hapa", "pale", "ndani", "nje", "karibu", "mbali", "kubwa", "ndogo", "nzuri", "mbaya",
  "mpya", "zamani", "joto", "baridi", "furaha", "huzuni", "ndiyo", "hapana", "tafadhali", "asante",
  "msaada", "kuja", "kwenda", "kula", "kunywa", "kuzungumza", "kusikiliza", "kusoma", "kuandika", "kuona",
  "kujua", "kuelewa", "kutaka", "kuhitaji", "kutoa", "kuchukua", "kununua", "kuuza", "kulipa"
];

const vocabularyItems = [
  ...englishWords.map((text) => ({ languageCode: "en", text })),
  ...kiswahiliWords.map((text) => ({ languageCode: "sw", text }))
];

const { data: importRow, error: importError } = await supabase
  .from("corpus_imports")
  .insert({
    name: "Sema launch corpus seed",
    source_type: "manual",
    item_count: seedItems.length + vocabularyItems.length,
    status: "queued"
  })
  .select("id")
  .single();

if (importError) throw importError;

const rows = seedItems.map(([text, domain]) => ({
  import_id: importRow.id,
  language_code: "en",
  text,
  domain,
  license: "Sema internal seed",
  difficulty: domain === "public services" ? "advanced" : "beginner",
  metadata: { seed: true, unit_type: "sentence" }
})).concat(vocabularyItems.map((item) => ({
  import_id: importRow.id,
  language_code: item.languageCode,
  text: item.text,
  domain: "everyday conversation",
  license: "Sema internal seed",
  difficulty: "beginner",
  metadata: { seed: true, unit_type: "word" }
})));

const { error } = await supabase.from("corpus_items").upsert(rows, {
  onConflict: "language_code,hash",
  ignoreDuplicates: false
});

if (error) throw error;

console.log(`Seeded ${rows.length} launch corpus items.`);

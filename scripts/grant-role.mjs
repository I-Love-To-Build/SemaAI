import { getAdminClient } from "./supabase-admin.mjs";

const email = process.argv[2];
const role = process.argv[3] || "ops_admin";
const languageCode = process.argv[4] || null;

if (!email) {
  console.error("Usage: node scripts/grant-role.mjs <email> [role] [languageCode]");
  process.exit(1);
}

const supabase = getAdminClient();
const { data, error } = await supabase.auth.admin.listUsers();

if (error) throw error;

const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());

if (!user) {
  console.error(`No Supabase Auth user found for ${email}. Sign up in the app first.`);
  process.exit(1);
}

const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  display_name: email.split("@")[0],
  home_language_code: languageCode ?? "sw",
  updated_at: new Date().toISOString()
});

if (profileError) throw profileError;

const { error: roleError } = await supabase.from("user_roles").upsert({
  user_id: user.id,
  role,
  language_code: languageCode
});

if (roleError) throw roleError;

console.log(`Granted ${role}${languageCode ? ` for ${languageCode}` : ""} to ${email}.`);

import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SEMA_AUDIO_BUCKET: z.string().default("recordings"),
  SEMA_EXPORT_BUCKET: z.string().default("exports"),
  SEMA_SEARCH_URL: z.string().url().optional().or(z.literal("")),
  SEMA_SEARCH_ADMIN_KEY: z.string().optional()
});

export function getEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment configuration: ${missing}`);
  }

  return parsed.data;
}

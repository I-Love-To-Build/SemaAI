"use client";

import { createClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://kzljvryviywivprdwsin.supabase.co";
const fallbackAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6bGp2cnl2aXl3aXZwcmR3c2luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0ODg2NDMsImV4cCI6MjA5OTA2NDY0M30.d2kgKE9y4DVATiuV7lBRW3o-IU7FHN5cZfCbkUpxrVk";

export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackSupabaseUrl;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fallbackAnonKey;

  if (!url || !anonKey) {
    throw new Error("Supabase browser credentials are missing.");
  }

  return createClient(url, anonKey);
}

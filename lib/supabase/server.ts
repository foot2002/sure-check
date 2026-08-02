import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Server-only Supabase client (service role).
 * Never import this module from client components.
 */
export function createSupabaseServerClient(): SupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function getSupabaseUrlStatus(): "OK" | "MISSING" {
  return process.env.SUPABASE_URL?.trim() ? "OK" : "MISSING";
}

export function getSupabaseServiceRoleKeyStatus(): "OK" | "MISSING" {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ? "OK" : "MISSING";
}

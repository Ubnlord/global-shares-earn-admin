import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // Never reuse the customer website's persisted Supabase session.
        storageKey: "gse-admin-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

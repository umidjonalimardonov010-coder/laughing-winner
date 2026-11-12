// Single place where the app talks to the database with full rights.
// All callers must verify who is calling (Telegram signature or admin session) first.
export { supabaseAdmin as db } from "@/integrations/supabase/client.server";

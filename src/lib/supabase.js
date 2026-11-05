import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey && !url.includes('your-project')
  ? createClient(url, anonKey)
  : null;

export const isSupabaseConfigured = Boolean(supabase);

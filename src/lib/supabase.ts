import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (typeof supabaseUrl !== 'string' || !supabaseUrl) {
  throw new Error('Missing VITE_SUPABASE_URL')
}

if (typeof supabaseAnonKey !== 'string' || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_ANON_KEY')
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

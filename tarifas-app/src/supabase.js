import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://uxclsvsfjfipmcjmjzqd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4Y2xzdnNmamZpcG1jam1qenFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2Njk0NDEsImV4cCI6MjEwMDI0NTQ0MX0.LF0Eg8bkKZwmf4o3yViVzKTVNsD7QcIhva4edQRbHfI'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
})

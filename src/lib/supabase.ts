import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://xxrkcfqoolxlbxtnrqpq.supabase.co';
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4cmtjZnFvb2x4bGJ4dG5ycXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MzMzMjYsImV4cCI6MjA5OTUwOTMyNn0.SGTyZKxbEnGiAWydC7U8iBcsMa15o7mk_ksOTrinxa4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

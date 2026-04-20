import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://nofdykirawhvmxtfpcwz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vZmR5a2lyYXdodm14dGZwY3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NTMzNzAsImV4cCI6MjA4NjAyOTM3MH0.zE2omU2-YgG87oR8SCdUqCu08_zOlOHQ6rQwjfELB00";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

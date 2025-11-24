// Supabase browser client
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Replace with your project details (publishable/anon key only)
const SUPABASE_URL = "https://ugldbwwpjcjtfhlpxbip.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnbGRid3dwamNqdGZobHB4YmlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NjQ0MDEsImV4cCI6MjA3OTI0MDQwMX0.T8FmQhyD4uXkKATpG13kzT8L6qA0pUfk_1G1Z0ES-Rs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

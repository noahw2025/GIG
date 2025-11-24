export const PORT = 4000; // change if port is taken
export const JWT_SECRET = process.env.JWT_SECRET || "";
export const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || "";
export const TICKETMASTER_BASE_URL = "https://app.ticketmaster.com/discovery/v2";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // optional

// Supabase configuration (use env vars; do not keep hardcoded keys in code)
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

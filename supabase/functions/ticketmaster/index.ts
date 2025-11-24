// Supabase Edge Function: Ticketmaster proxy to bypass browser CORS.
// Deploy with `supabase functions deploy ticketmaster --no-verify-jwt`
// Set env: TICKETMASTER_API_KEY

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  const url = new URL(req.url);
  const TM_KEY = Deno.env.get("TICKETMASTER_API_KEY");
  if (!TM_KEY) {
    return new Response("Missing TICKETMASTER_API_KEY", { status: 500 });
  }

  const params = new URLSearchParams(url.search);
  params.set("apikey", TM_KEY);
  if (!params.has("segmentId")) params.set("segmentId", "KZFzniwnSyZfZ7v7nJ"); // Music
  if (!params.has("size")) params.set("size", "20");

  const target = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;
  const resp = await fetch(target);
  const body = await resp.text();

  return new Response(body, {
    status: resp.status,
    headers: {
      "Content-Type": resp.headers.get("Content-Type") || "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

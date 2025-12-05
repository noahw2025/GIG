// Supabase Edge Function: Artist Summary (short, max ~20 words)
// Deploy: supabase functions deploy artist-summary --no-verify-jwt
// Env required: OPENAI_API_KEY

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };

    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ summary: "Could not generate artist summary." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const artist = body?.artist || "";
    const event = body?.event || {};

    if (!artist) {
      return new Response(JSON.stringify({ summary: "No artist specified." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contextParts = [];
    if (artist) contextParts.push(`Artist: ${artist}`);
    if (event.title) contextParts.push(`Event: ${event.title}`);
    if (event.venue) contextParts.push(`Venue: ${event.venue}`);
    if (event.location) contextParts.push(`Location: ${event.location}`);
    if (event.date) contextParts.push(`Date: ${event.date}`);
    if (event.genre) contextParts.push(`Genre: ${event.genre}`);
    if (event.description) contextParts.push(`Description: ${event.description}`);
    const context = contextParts.join("\n");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 60,
        temperature: 0.7,
        messages: [
          {
            role: "system",
            content: "You write very short hype summaries for concerts. Mention both the artist and this specific show/venue. Use at most 25 words, one or two short sentences.",
          },
          { role: "user", content: `Write a very short, exciting summary for this artist and show for TrackMyGig:\n\n${context}` },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.error?.message || "Could not generate artist summary.";
      return new Response(JSON.stringify({ summary: message }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = data?.choices?.[0]?.message?.content || "Could not generate artist summary.";
    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    };
    return new Response(JSON.stringify({ summary: "Could not generate artist summary." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

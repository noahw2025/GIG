// Supabase Edge Function: Chatbot with Ticketmaster + OpenAI fallback
// Deploy: `supabase functions deploy chatbot --no-verify-jwt`
// Env required: TICKETMASTER_API_KEY, OPENAI_API_KEY

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const MUSIC_SEGMENT_ID = "KZFzniwnSyZfZ7v7nJ";

const mapEvent = (event: any) => {
  const artist = event?._embedded?.attractions?.[0]?.name || event.name;
  const venue = event?._embedded?.venues?.[0];
  const locationParts: string[] = [];
  if (venue?.city?.name) locationParts.push(venue.city.name);
  if (venue?.state?.stateCode) locationParts.push(venue.state.stateCode);
  const location = locationParts.filter(Boolean).join(", ");
  return {
    external_id: event.id,
    artist,
    title: event.name,
    location,
    venue: venue?.name,
    date: event.dates?.start?.dateTime,
    description: event.info || event.pleaseNote || "",
    ticket_url: event.url,
    genre: event.classifications?.[0]?.genre?.name,
  };
};

serve(async (req) => {
  try {
    const TM_KEY = Deno.env.get("TICKETMASTER_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const body = await req.json();
    const message = (body?.message || "").trim();
    const city = body?.city || "";
    const genre = body?.genre || "";
    const keyword = body?.keyword || message;

    if (!message) return new Response(JSON.stringify({ error: "Message required" }), { status: 400 });
    if (!TM_KEY && !OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "No AI or Ticketmaster configured" }), { status: 500 });
    }

    const params = new URLSearchParams({ size: "6", segmentId: MUSIC_SEGMENT_ID, segmentName: "Music" });
    if (TM_KEY) params.set("apikey", TM_KEY);
    if (keyword) params.append("keyword", keyword);
    if (city) params.append("city", city);
    if (genre) params.append("classificationName", genre);
    const tmUrl = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;

    let events: any[] = [];
    if (TM_KEY) {
      const tmRes = await fetch(tmUrl);
      const tmData = await tmRes.json();
      if (tmRes.ok) {
        events = (tmData?._embedded?.events || []).map(mapEvent).slice(0, 3);
        if (events.length) {
          return new Response(JSON.stringify({ reply: `Here are ${events.length} options${city ? ` near ${city}` : ""}${genre ? ` for ${genre}` : ""}:`, events }), {
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
          });
        }
      }
    }

    if (OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          max_tokens: 140,
          temperature: 0.7,
          messages: [
            { role: "system", content: "You are a concise concert assistant. Give 2-3 options or practical tips in under 80 words." },
            { role: "user", content: `Question: ${message}. City: ${city || "unknown"}. Genre: ${genre || "any"}. Keyword: ${keyword}` },
            { role: "system", content: "If you lack real events, suggest searching by a nearby major city and keep it short." },
          ],
        }),
      });
      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || "Try another artist or city.";
      return new Response(JSON.stringify({ reply: text, events: [] }), {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply: "No shows matched that. Try another artist, city, or genre.", events: [] }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || "Server error" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});

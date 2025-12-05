// Supabase Edge Function: AI-first Chatbot for TrackMyGig
// Deploy: `supabase functions deploy chatbot --no-verify-jwt`
// Env: TICKETMASTER_API_KEY (optional), OPENAI_API_KEY (recommended)

import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

type SearchIntent = "concert_search" | "artist_info" | "general_chat";

type SearchPlan = {
  intent: SearchIntent;
  city?: string | null;
  genre?: string | null;
  artist?: string | null;
  dateRange?: string | null; // e.g. "anytime", "this_weekend", "this_month"
};

type TicketmasterEvent = {
  name: string;
  date: string;
  city: string;
  state: string;
  venue: string;
  url: string;
  minPrice?: number;
  maxPrice?: number;
  genre?: string;
};

type LastEventContext = {
  name?: string;
  genre?: string;
  venue?: string;
  city?: string;
  state?: string;
  date?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildDateRangeParams(dateRange: string | null | undefined): { startDateTime?: string; endDateTime?: string } {
  if (!dateRange) return {};
  const now = new Date();
  const toIso = (d: Date) => d.toISOString();
  const addDays = (d: Date, days: number) => {
    const copy = new Date(d.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
  };

  if (dateRange === "this_weekend") {
    const day = now.getDay(); // 0=Sun
    const daysUntilFriday = (5 - day + 7) % 7;
    const start = addDays(now, daysUntilFriday);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 2);
    end.setHours(23, 59, 59, 999);
    return { startDateTime: toIso(start), endDateTime: toIso(end) };
  }

  if (dateRange === "this_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { startDateTime: toIso(start), endDateTime: toIso(end) };
  }

  if (dateRange === "next_month") {
    const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    end.setHours(23, 59, 59, 999);
    return { startDateTime: toIso(start), endDateTime: toIso(end) };
  }

  if (dateRange === "this_week") {
    const day = now.getDay(); // 0=Sun
    const start = new Date(now);
    start.setDate(now.getDate() - day); // Sunday
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { startDateTime: toIso(start), endDateTime: toIso(end) };
  }

  return {};
}

function normalizeGenreForTicketmaster(genre: string | null | undefined): string | undefined {
  if (!genre) return undefined;
  const g = genre.toLowerCase();
  if (g.includes("rap") || g.includes("hip hop") || g.includes("hip-hop")) return "Rap/Hip-Hop";
  if (g.includes("edm") || g.includes("electronic")) return "Electronic";
  if (g.includes("rock")) return "Rock";
  if (g.includes("r&b") || g.includes("rnb")) return "R&B";
  if (g.includes("pop")) return "Pop";
  return undefined;
}

function mapTmResponseToEvents(tmJson: any): TicketmasterEvent[] {
  const events = tmJson?._embedded?.events ?? [];
  return events.slice(0, 10).map((e: any) => {
    const venue = e._embedded?.venues?.[0] ?? {};
    const priceRange = Array.isArray(e.priceRanges) && e.priceRanges.length > 0 ? e.priceRanges[0] : {};
    const attraction = e._embedded?.attractions?.[0] ?? {};
    const genre =
      e.classifications?.[0]?.genre?.name ||
      e.classifications?.[0]?.segment?.name ||
      e?.genre ||
      e?.segment ||
      undefined;
    const rawName = e.name || attraction.name || "";
    const name = rawName && String(rawName).toLowerCase() !== "undefined" ? rawName : "Concert";
    return {
      name,
      date: e.dates?.start?.localDate ?? "",
      city: venue.city?.name ?? attraction?.city ?? "",
      state: venue.state?.stateCode ?? attraction?.state ?? "",
      venue: venue.name ?? attraction?.venue ?? "",
      url: e.url ?? "",
      minPrice: typeof priceRange.min === "number" ? priceRange.min : undefined,
      maxPrice: typeof priceRange.max === "number" ? priceRange.max : undefined,
      genre,
    };
  });
}

function buildEventsHtml(events: TicketmasterEvent[]): string {
  if (!events.length) return "";
  const safe = (val: any, fallback: string) => {
    if (!val) return fallback;
    const s = String(val);
    if (s.trim().length === 0) return fallback;
    const lower = s.trim().toLowerCase();
    if (lower === "undefined" || lower === "null") return fallback;
    return s;
  };
  const items = events.map((ev) => {
    const title = safe(ev.name, "Concert");
    const venue = safe(ev.venue, "Venue TBA");
    const city = safe(ev.city, "");
    const state = safe(ev.state, "");
    const date = safe(ev.date, "TBD");
    return `<li><strong>${title}</strong> — ${venue}${city || state ? ` - ${city}${state ? `, ${state}` : ""}` : ""} on ${date} (${ev.url ? `<a href="${ev.url}" target="_blank" rel="noopener">tickets</a>` : "tickets"})</li>`;
  });
  return `<ul>${items.join("")}</ul>`;
}

function summarizeEventsForLlm(events: TicketmasterEvent[]): string {
  if (!events.length) return "[]";
  const lines = events.map((ev, idx) => {
    const price =
      typeof ev.minPrice === "number" && typeof ev.maxPrice === "number"
        ? `$${ev.minPrice.toFixed(0)}-$${ev.maxPrice.toFixed(0)}`
        : "no clear price range";
    const genre = ev.genre ? ` Genre: ${ev.genre}.` : "";
    const safe = (val: any, fallback: string) => {
      if (!val) return fallback;
      const s = String(val);
      if (s.trim().length === 0) return fallback;
      const lower = s.trim().toLowerCase();
      if (lower === "undefined" || lower === "null") return fallback;
      return s;
    };
    const title = safe(ev.name, "Concert");
    const venue = safe(ev.venue, "Venue TBA");
    const cityState = [safe(ev.city, ""), safe(ev.state, "")]
      .filter((v) => v)
      .join(", ");
    const date = safe(ev.date, "TBD");
    return `${idx + 1}. "${title}" at ${venue}${cityState ? ` in ${cityState}` : ""} on ${date} (${price}).${genre} Ticketmaster URL: ${ev.url}`;
  });
  return lines.join("\n");
}

function summarizeLastEventsForLlm(events: LastEventContext[]): string {
  if (!events.length) return "[]";
  return events
    .map((ev, idx) => {
      const genre = ev.genre ? ` Genre: ${ev.genre}.` : "";
      const loc = [ev.venue, ev.city, ev.state].filter(Boolean).join(", ");
      const date = ev.date ? ` Date: ${ev.date}.` : "";
      return `${idx + 1}. "${ev.name || "Unknown"}"${genre}${loc ? ` @ ${loc}.` : ""}${date}`;
    })
    .join("\n");
}

async function extractSearchPlan(
  openai: any,
  message: string,
  profileCity?: string | null,
  profileGenre?: string | null
): Promise<SearchPlan> {
  const systemPrompt = `
You are a helper that extracts a structured search plan for a concert assistant.
You MUST respond with a single line of valid JSON only, no explanation.

The JSON must have the shape:
{
  "intent": "concert_search" | "artist_info" | "general_chat",
  "city": string | null,
  "genre": string | null,
  "artist": string | null,
  "dateRange": string | null
}

Rules:
- If the user is clearly asking for concerts/shows (e.g. "concerts in Atlanta", "rap concerts in Miami", "does J.I.D have any concerts"), use intent "concert_search".
- If the user is asking "who is X", "what is X" and it's about an artist, use intent "artist_info".
- If it looks like small talk, greetings, or general questions not directly asking for shows, use "general_chat".
- For "city", use the city mentioned in the user message if there is one, otherwise use the profile city (if any), otherwise null.
- For "genre", use any genre mentioned by the user (rap, hip hop, edm, electronic, rock, pop, r&b, etc). Otherwise use the profile genre (if any), otherwise null.
- For "artist", use the artist name if the user is clearly asking about concerts for a specific artist (e.g., "does Drake have concerts in New York").
- For "dateRange", you can use rough labels like "this_weekend", "this_week", "this_month", "next_month", "anytime". If the user does not specify, use "anytime".
- If in doubt, choose the simplest reasonable interpretation.
`;

  const userPayload = {
    message,
    profileCity: profileCity ?? null,
    profileGenre: profileGenre ?? null,
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(userPayload),
      },
    ],
    max_tokens: 200,
    temperature: 0.2,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  try {
    const parsed = JSON.parse(raw);
    const intent: SearchIntent =
      parsed.intent === "concert_search" || parsed.intent === "artist_info" || parsed.intent === "general_chat"
        ? parsed.intent
        : "general_chat";
    return {
      intent,
      city: parsed.city ?? null,
      genre: parsed.genre ?? null,
      artist: parsed.artist ?? null,
      dateRange: parsed.dateRange ?? null,
    };
  } catch (err) {
    console.error("Failed to parse search plan JSON:", raw, err);
    return {
      intent: "general_chat",
      city: profileCity ?? null,
      genre: profileGenre ?? null,
      artist: null,
      dateRange: "anytime",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const TICKETMASTER_API_KEY = Deno.env.get("TICKETMASTER_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const body = await req.json();

    const userMessage = (body?.message || "").trim();
    const profileCity = body?.city || body?.profileCity || body?.lastCity || null;
    const profileGenre = body?.genre || body?.profileGenre || null;
    const keywordFromBody = body?.keyword || null;
    const lastEventsFromClient: LastEventContext[] = Array.isArray(body?.lastEvents)
      ? body.lastEvents
          .slice(0, 10)
          .map((ev: any) => ({
            name: ev?.name,
            genre: ev?.genre,
            venue: ev?.venue,
            city: ev?.city,
            state: ev?.state,
            date: ev?.date,
          }))
      : [];

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "Message required" }), { status: 400, headers: corsHeaders });
    }

    let searchPlan: SearchPlan = {
      intent: "general_chat",
      city: profileCity,
      genre: profileGenre,
      artist: null,
      dateRange: "anytime",
    };

    const openai = OPENAI_API_KEY
      ? {
          chat: {
            completions: {
              create: async (payload: any) => {
                const res = await fetch("https://api.openai.com/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                  },
                  body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) {
                  const err: any = new Error(data?.error?.message || "OpenAI error");
                  err.data = data;
                  throw err;
                }
                return data;
              },
            },
          },
        }
      : null;

    if (openai) {
      try {
        searchPlan = await extractSearchPlan(openai, userMessage, profileCity, profileGenre);
      } catch (err) {
        console.error("Error extracting search plan:", err);
      }
    }
    const msgLower = userMessage.toLowerCase();
    if (!searchPlan.dateRange || searchPlan.dateRange === "anytime") {
      if (msgLower.includes("next month")) searchPlan.dateRange = "next_month";
      else if (msgLower.includes("this month")) searchPlan.dateRange = "this_month";
      else if (msgLower.includes("this weekend") || msgLower.includes("weekend")) searchPlan.dateRange = "this_weekend";
      else if (msgLower.includes("this week")) searchPlan.dateRange = "this_week";
    }

    let events: TicketmasterEvent[] = [];
    let html = "";

    if (searchPlan.intent === "concert_search" && TICKETMASTER_API_KEY) {
      const classificationName = normalizeGenreForTicketmaster(searchPlan.genre || null);
      const rangeParams = buildDateRangeParams(searchPlan.dateRange);
      const keywordPrimary = searchPlan.artist || keywordFromBody || null;
      const keywordFallback = userMessage || null;

      const fetchTm = async (opts: { useGenre: boolean; useDateRange: boolean; useCity: boolean; keyword: string | null }) => {
        const tmUrl = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
        tmUrl.searchParams.set("apikey", TICKETMASTER_API_KEY);
        tmUrl.searchParams.set("segmentId", "KZFzniwnSyZfZ7v7nJ"); // Music
        tmUrl.searchParams.set("size", "20");
        tmUrl.searchParams.set("sort", "date,asc");
        if (opts.useCity && searchPlan.city) tmUrl.searchParams.set("city", searchPlan.city);
        if (opts.keyword) tmUrl.searchParams.set("keyword", opts.keyword);
        if (opts.useGenre && classificationName) tmUrl.searchParams.set("classificationName", classificationName);
        if (opts.useDateRange) {
          if (rangeParams.startDateTime) tmUrl.searchParams.set("startDateTime", rangeParams.startDateTime);
          if (rangeParams.endDateTime) tmUrl.searchParams.set("endDateTime", rangeParams.endDateTime);
        }
        const tmRes = await fetch(tmUrl.toString());
        if (!tmRes.ok) {
          console.error("Ticketmaster error status:", tmRes.status);
          return [];
        }
        const tmJson = await tmRes.json();
        return mapTmResponseToEvents(tmJson);
      };

      const passes: { useGenre: boolean; useDateRange: boolean; useCity: boolean; keyword: string | null }[] = [];
      passes.push({ useGenre: true, useDateRange: true, useCity: true, keyword: keywordPrimary });
      passes.push({ useGenre: false, useDateRange: true, useCity: true, keyword: keywordPrimary });
      passes.push({ useGenre: false, useDateRange: false, useCity: true, keyword: keywordPrimary });
      passes.push({ useGenre: true, useDateRange: true, useCity: true, keyword: null });
      passes.push({ useGenre: false, useDateRange: true, useCity: true, keyword: null });
      passes.push({ useGenre: false, useDateRange: false, useCity: true, keyword: null });
      if (keywordPrimary) {
        passes.push({ useGenre: false, useDateRange: false, useCity: false, keyword: keywordPrimary });
      }
      if (keywordFallback && keywordFallback !== keywordPrimary) {
        passes.push({ useGenre: false, useDateRange: false, useCity: true, keyword: keywordFallback });
        passes.push({ useGenre: false, useDateRange: false, useCity: false, keyword: keywordFallback });
      }

      try {
        for (const p of passes) {
          events = await fetchTm(p);
          if (events.length) break;
        }
        html = buildEventsHtml(events);
      } catch (err) {
        console.error("Error calling Ticketmaster:", err);
      }
    }

    const eventsSummary = summarizeEventsForLlm(events);

    const assistantSystemPrompt = `
You are TrackMyGig, an AI concert assistant for the TrackMyGig web app.

You can:
- Help users find concerts using Ticketmaster data that I give you.
- Answer questions about artists, genres, venues, and general concert-going.
- Have short, friendly conversations about shows, ideas, and plans.

You will receive (as JSON):
- userMessage: the latest thing the user typed.
- searchPlan: the interpreted intent and filters (intent, city, genre, artist, dateRange).
- ticketmasterEvents: a text summary of concerts from Ticketmaster (may be "[]" if there are none).
- lastEventsContext: optional summary of events the user just saw in the UI (may include genre, venue, city, date).

Rules:
- If searchPlan.intent is "general_chat":
  - Respond like a normal chat assistant about music, concerts, or the user's message.
  - Do NOT mention Ticketmaster or "current Ticketmaster results" unless the user explicitly asked for concerts.
- If searchPlan.intent is "artist_info":
  - Explain who the artist is, using your knowledge.
  - Only talk about specific shows if ticketmasterEvents contains matching shows AND the user asked about concerts.
- If searchPlan.intent is "concert_search":
  - Use ticketmasterEvents as the ONLY source of specific shows.
  - If ticketmasterEvents is "[]":
    - You may say: "I don't see any matching shows in the current Ticketmaster results."
    - Suggest 1-2 ways to broaden the search (change dates, city, or genre).
  - If ticketmasterEvents has items:
    - Recommend 1-5 shows that make sense given userMessage and searchPlan.
    - Mention artist, venue, city, and date naturally.
    - Do NOT invent shows or details not present in ticketmasterEvents.
- If the user asks a follow-up like "what genre are they?" and lastEventsContext is provided, use lastEventsContext to answer about the listed artists/shows without asking them to repeat.

General:
- Do not say there are "no concerts at all" in a city; only say Ticketmaster has no matching results for this search.
- Output plain text only, no JSON, no markdown.
- Keep replies concise: usually 2-5 sentences.
`;

    const userPayloadForReply = {
      userMessage,
      searchPlan,
      ticketmasterEvents: eventsSummary,
      lastEventsContext: summarizeLastEventsForLlm(lastEventsFromClient),
    };

    let reply: string;

    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: assistantSystemPrompt },
            {
              role: "user",
              content: JSON.stringify(userPayloadForReply),
            },
          ],
          max_tokens: 220,
          temperature: 0.6,
        });
        reply = completion.choices[0]?.message?.content?.trim() ?? "";
      } catch (err) {
        console.error("Error calling OpenAI for final reply:", err);
        reply = events.length
          ? "Here are some concerts I found for you below based on your request."
          : "I couldn't generate a detailed answer right now, but you can try adjusting your city, dates, or genres and asking again.";
      }
    } else {
      reply = events.length
        ? "Here are some concerts I found for you below based on your request."
        : "I don't see any matching shows in the current Ticketmaster results. Try changing the city, dates, or genre and ask again.";
    }

    return new Response(JSON.stringify({ reply, html, events }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error", err);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

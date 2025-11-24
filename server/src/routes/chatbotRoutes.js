import express from "express";
import fetch from "node-fetch";
import { requireAuth } from "../middleware/authMiddleware.js";
import { OPENAI_API_KEY, TICKETMASTER_API_KEY, TICKETMASTER_BASE_URL } from "../config/config.js";
import { getUserById } from "../models/users.js";

const router = express.Router();

router.use(requireAuth);

const buildAssistantPrompt = (user) =>
  `You are TrackMyGig, a friendly concert assistant. The user profile: city=${user?.city || "unknown"}, favorite artists=${user?.favorite_artists ||
    "none"}, favorite genre=${user?.favorite_genre || "none"}. Keep responses concise, list concrete shows with dates and ticket links, and avoid generic advice if results exist.`;

const mapEvent = (ev) => {
  const artist = ev?._embedded?.attractions?.[0]?.name || ev.name;
  const venue = ev?._embedded?.venues?.[0];
  const locationParts = [];
  if (venue?.city?.name) locationParts.push(venue.city.name);
  if (venue?.state?.stateCode) locationParts.push(venue.state.stateCode);
  const location = locationParts.filter(Boolean).join(", ");
  return {
    external_id: ev.id,
    artist,
    title: ev.name,
    location,
    venue: venue?.name,
    date: ev.dates?.start?.dateTime,
    ticket_url: ev.url,
    genre: ev.classifications?.[0]?.genre?.name,
  };
};

const formatEventsHtml = (events = []) => {
  if (!events.length) return "";
  const escape = (str = "") =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const items = events
    .map((ev) => {
      const date = ev.date ? new Date(ev.date).toLocaleDateString() : "TBD";
      const venue = ev.venue || ev.location || "TBD";
      const ticket = ev.ticket_url ? `<a href="${escape(ev.ticket_url)}" target="_blank" rel="noopener">tickets</a>` : "tickets";
      return `<li><strong>${escape(ev.artist || ev.title || "Concert")}</strong> - ${escape(venue)} on ${escape(
        date
      )} (${ticket})</li>`;
    })
    .join("");
  return `<ul>${items}</ul>`;
};

const searchTicketmasterQuick = async ({ keyword, city, genre, startDateTime, endDateTime }) => {
  if (!TICKETMASTER_API_KEY || TICKETMASTER_API_KEY === "YOUR_TICKETMASTER_KEY") {
    return { events: [], note: "Ticketmaster API key not configured" };
  }
  const params = new URLSearchParams({
    apikey: TICKETMASTER_API_KEY,
    size: "8",
    segmentName: "Music",
  });
  if (keyword) params.append("keyword", keyword);
  if (city) params.append("city", city);
  if (genre) params.append("classificationName", genre);
  if (startDateTime) params.append("startDateTime", startDateTime);
  if (endDateTime) params.append("endDateTime", endDateTime);
  const url = `${TICKETMASTER_BASE_URL}/events.json?${params.toString()}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      return { events: [], note: data?.fault?.faultstring || "Unable to fetch events" };
    }
    const events = (data?._embedded?.events || []).map(mapEvent);
    return { events };
  } catch {
    return { events: [], note: "Ticketmaster lookup failed" };
  }
};

const dateRangeFromMessage = () => {
  const now = new Date();
  const utc = (d) => d.toISOString().slice(0, 19) + "Z";
  const lower = (s) => (s || "").toLowerCase();
  return (message) => {
    const msg = lower(message);
    const start = new Date(now);
    const end = new Date(now);
    if (msg.includes("tonight") || msg.includes("today")) {
      end.setDate(end.getDate() + 1);
      return { startDateTime: utc(start), endDateTime: utc(end) };
    }
    if (msg.includes("weekend")) {
      end.setDate(end.getDate() + (7 - end.getDay()));
      return { startDateTime: utc(start), endDateTime: utc(end) };
    }
    if (msg.includes("week")) {
      end.setDate(end.getDate() + 7);
      return { startDateTime: utc(start), endDateTime: utc(end) };
    }
    return {};
  };
};

const rangeFromMessage = dateRangeFromMessage();

const parseIntent = (message, user) => {
  const lower = message.toLowerCase();
  const cityMatch = lower.match(/in ([a-zA-Z\s]+?)(\?|$)/);
  const city = cityMatch ? cityMatch[1].trim() : user.city;
  const maybeGenre = ["rap", "rock", "pop", "country", "hip hop", "hip-hop", "jazz", "r&b", "edm"].find((g) => lower.includes(g));
  const genre = maybeGenre || null;
  const cleaned = message
    .replace(/concerts?|shows?|tickets?/gi, "")
    .replace(/find|looking for|upcoming|next|please|me/gi, "")
    .trim();
  const keyword = cleaned || message;
  const range = rangeFromMessage(message);
  const artistHint = keyword.split(" ").slice(0, 6).join(" ").trim();
  const fallbackArtist = user.favorite_artists ? user.favorite_artists.split(",")[0].trim() : "";
  return { keyword: artistHint || fallbackArtist || keyword, city, genre, range };
};

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    const user = (await getUserById(req.user.id)) || {};
    if (!message) return res.status(400).json({ error: "Message required" });
    const intent = parseIntent(message, user);
    const { events, note } = await searchTicketmasterQuick({
      keyword: intent.keyword,
      city: intent.city,
      genre: intent.genre,
      ...intent.range,
    });
    const eventsHtml = formatEventsHtml(events);

    if (events.length) {
      const summary = `Found ${events.length} show${events.length > 1 ? "s" : ""}${intent.city ? ` near ${intent.city}` : ""}${
        intent.genre ? ` in ${intent.genre}` : ""
      }.`;
      return res.json({ reply: summary, html: eventsHtml });
    }

    if (!OPENAI_API_KEY) {
      return res.json({
        reply: `No shows found right now. Try another city or artist, or use Browse to search.`,
        html: "",
      });
    }

    const eventContext = (events || [])
      .map(
        (ev) =>
          `- ${ev.artist} at ${ev.venue || ev.location || "TBD"} on ${ev.date || "TBD"} | tickets: ${ev.ticket_url || "N/A"}`
      )
      .join("\n");

    const systemPrompt = `${buildAssistantPrompt(user)}\nWhen asked about concerts, prefer real Ticketmaster results in the context below. If none, suggest how to search. Keep it concise and give ticket links when available.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
          { role: "system", content: `Ticketmaster results:\n${eventContext || "No events found"}\nNote: ${note || "live data"}` },
        ],
        max_tokens: 220,
      }),
    });
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content || "I'm not sure, try again.";
    res.json({ reply, html: eventsHtml });
  } catch (err) {
    console.error("Chatbot failed:", err);
    res.status(500).json({ error: err?.message || "Chatbot unavailable" });
  }
});

export default router;

import express from "express";
import fetch from "node-fetch";
import { TICKETMASTER_API_KEY, TICKETMASTER_BASE_URL, OPENAI_API_KEY } from "../config/config.js";
import { getConcertById } from "../models/concerts.js";
import { getUserById } from "../models/users.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

const mapEvent = (event) => {
  const artist = event?._embedded?.attractions?.[0]?.name || event.name;
  const venue = event?._embedded?.venues?.[0];
  const locationParts = [];
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
    source: "ticketmaster",
    genre: event.classifications?.[0]?.genre?.name,
  };
};

const MUSIC_SEGMENT_ID = "KZFzniwnSyZfZ7v7nJ"; // Ticketmaster Music segment

const searchTicketmaster = async (params, { forceMusic = true } = {}) => {
  if (!TICKETMASTER_API_KEY || TICKETMASTER_API_KEY === "YOUR_TICKETMASTER_KEY") {
    return { error: "Ticketmaster API key not configured" };
  }
  const searchParams = new URLSearchParams({ apikey: TICKETMASTER_API_KEY, size: "20" });
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.append(key, value);
  });
  if (forceMusic) {
    searchParams.append("segmentId", MUSIC_SEGMENT_ID);
    searchParams.append("segmentName", "Music");
  }
  const url = `${TICKETMASTER_BASE_URL}/events.json?${searchParams.toString()}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      const message = data?.fault?.faultstring || data?.errors?.[0]?.detail || "Failed to fetch events";
      return { error: message };
    }
    const events = data?._embedded?.events || [];
    return events.map(mapEvent);
  } catch (err) {
    return { error: "Could not reach Ticketmaster" };
  }
};

router.get("/search", async (req, res) => {
  try {
    const { keyword, city, genre, startDate, endDate } = req.query;
    const params = {};
    if (keyword) params.keyword = keyword;
    if (city) params.city = city;
    if (genre) {
      params.classificationName = genre;
      params.keyword = `${params.keyword || ""} ${genre}`.trim();
    }
    if (startDate) params.startDateTime = `${startDate}T00:00:00Z`;
    if (endDate) params.endDateTime = `${endDate}T23:59:59Z`;
    const results = await searchTicketmaster(params, { forceMusic: true });
    if (results.error) return res.status(400).json(results);
    res.json({ events: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch concerts" });
  }
});

router.get("/recommended", requireAuth, async (req, res) => {
  try {
    const user = req.user ? await getUserById(req.user.id) : null;
    const { city, favorite_artists, favorite_genre } = user || {};
    const artists = favorite_artists
      ? favorite_artists
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const keyword = artists[0] || favorite_genre || "";
    const params = {};
    if (city) params.city = city;
    if (keyword) params.keyword = keyword;
    if (favorite_genre) params.classificationName = favorite_genre;
    if (artists.length > 1) params.keyword = `${keyword} ${artists.slice(1).join(" ")}`.trim();
    const results = await searchTicketmaster(params, { forceMusic: true });
    if (results.error) return res.status(400).json(results);
    res.json({ events: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch recommendations" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const concert = await getConcertById(req.params.id);
    if (!concert) return res.status(404).json({ error: "Concert not found" });
    res.json({ concert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch concert" });
  }
});

router.post("/:id/summary", async (req, res) => {
  try {
    const concert = await getConcertById(req.params.id);
    if (!concert) return res.status(404).json({ error: "Concert not found" });
    if (!OPENAI_API_KEY) {
      return res.json({
        summary: `Summary unavailable without AI key. ${concert.artist} at ${concert.venue || concert.location} on ${concert.date}. Expect a great vibe!`,
      });
    }
    const prompt = `Give a short hype blurb for this concert in 2 sentences. Artist: ${concert.artist}. Title: ${concert.title}. Venue: ${concert.venue}. Location: ${concert.location}. Date: ${concert.date}.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a concise concert hype writer." },
          { role: "user", content: prompt },
        ],
        max_tokens: 120,
      }),
    });
    const data = await response.json();
    const summary = data?.choices?.[0]?.message?.content || "Summary unavailable right now.";
    res.json({ summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not generate summary" });
  }
});

export default router;

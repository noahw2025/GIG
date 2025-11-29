import { supabase } from "./supabaseClient.js";
import bcrypt from "https://cdn.jsdelivr.net/npm/bcryptjs@2.4.3/+esm";

const tokenKey = "trackmygig_token";
const userKey = "trackmygig_user";
// Replace before deploying, or move to an Edge Function to keep it private.
const OPENAI_API_KEY = ""; // e.g. injected at build time or via chatbot proxy

const asUserId = (user) => {
  if (!user?.id) throw new Error("Not logged in");
  return Number(user.id);
};

const currentUser = () => {
  const raw = localStorage.getItem(userKey);
  return raw ? JSON.parse(raw) : null;
};

export const getToken = () => localStorage.getItem(tokenKey);

export const setAuth = (token, user) => {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
};

export const getStoredUser = currentUser;

export const requireAuth = () => {
  if (!currentUser()) {
    window.location.href = "./index.html";
  }
};

export const showToast = (message) => {
  const el = document.getElementById("globalToast") || document.getElementById("authMessage");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "TBD";
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
};

// ---------- Auth ----------
const signup = async (payload) => {
  const { email, password, full_name, city, favorite_artists, favorite_genre } = payload;
  const { data: existing, error: existingErr } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (existingErr) throw existingErr;
  if (existing) throw new Error("Email already in use");
  const password_hash = await bcrypt.hash(password, 10);
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("users")
    .insert([{ email, password_hash, full_name, city, favorite_artists, favorite_genre, created_at }])
    .select()
    .single();
  if (error) throw error;
  const { password_hash: _omit, ...safeUser } = data || {};
  setAuth(String(safeUser.id), safeUser);
  return { token: String(safeUser.id), user: safeUser };
};

const login = async ({ email, password }) => {
  const { data: user, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw error;
  if (!user) throw new Error("Invalid credentials");
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) throw new Error("Invalid credentials");
  const { password_hash, ...safeUser } = user;
  setAuth(String(safeUser.id), safeUser);
  return { token: String(safeUser.id), user: safeUser };
};

// ---------- Concert helpers ----------
const ensureConcert = async (concert) => {
  const { data: existing, error: findErr } = await supabase
    .from("concerts")
    .select("*")
    .eq("external_id", concert.external_id)
    .maybeSingle();
  if (findErr) throw findErr;
  const created_at = new Date().toISOString();
  // Only insert/update known columns to avoid schema mismatches (e.g., missing genre)
  const insertRow = {
    external_id: concert.external_id,
    artist: concert.artist,
    title: concert.title,
    location: concert.location,
    venue: concert.venue,
    date: concert.date,
    description: concert.description,
    ticket_url: concert.ticket_url,
    source: concert.source,
    genre: concert.genre,
    min_price: concert.min_price,
    max_price: concert.max_price,
    ticket_status: concert.ticket_status,
    created_at,
  };
  if (existing) {
    const patch = {};
    ["artist", "title", "location", "venue", "date", "description", "ticket_url", "genre", "min_price", "max_price", "ticket_status"].forEach((key) => {
      if (concert[key] !== undefined && concert[key] !== existing[key]) {
        patch[key] = concert[key];
      }
    });
    if (Object.keys(patch).length) {
      const { data: updated, error: updateErr } = await supabase
        .from("concerts")
        .update(patch)
        .eq("id", existing.id)
        .select()
        .single();
      if (updateErr) throw updateErr;
      return { ...updated, _previous: existing };
    }
    return { ...existing, _previous: existing };
  }
  const { data, error } = await supabase.from("concerts").insert([insertRow]).select().single();
  if (error) throw error;
  return { ...data, _previous: null };
};

// ---------- Favorites ----------
const fetchFavorites = async () => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase
    .from("favorites")
    .select("id, created_at, concerts(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const { data: reviews, error: revErr } = await supabase
    .from("reviews")
    .select("concert_id, rating, comment, created_at")
    .eq("user_id", userId);
  if (revErr) throw revErr;
  const reviewMap = new Map((reviews || []).map((r) => [r.concert_id, r]));
  return (
    data?.map((row) => ({
      favorite_id: row.id,
      favorited_at: row.created_at,
      ...(row.concerts || {}),
      user_review: reviewMap.get(row.concerts?.id),
    })) || []
  );
};

const addFavorite = async (concertPayload) => {
  const user = currentUser();
  const userId = asUserId(user);
  const concert = await ensureConcert(concertPayload);
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("favorites")
    .upsert({ user_id: userId, concert_id: concert.id, created_at }, { onConflict: "user_id,concert_id" })
    .select()
    .single();
  if (error) throw error;
  await createNotification(userId, {
    type: "GENERAL",
    title: "Added to favorites",
    message: `Saved ${concert.artist} at ${concert.venue || concert.location || "TBD"}. We'll nudge you before the show.`,
  });
  notifyTicketSignals(userId, concert);
  return { concert, favorite: data };
};

const removeFavorite = async (favoriteId) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { error } = await supabase.from("favorites").delete().eq("id", favoriteId).eq("user_id", userId);
  if (error) throw error;
  return true;
};

// ---------- Wishlist ----------
const fetchWishlist = async () => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase
    .from("wishlists")
    .select("id, created_at, concerts(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (
    data?.map((row) => ({
      wishlist_id: row.id,
      wishlisted_at: row.created_at,
      ...(row.concerts || {}),
    })) || []
  );
};

const addWishlist = async (concertPayload) => {
  const user = currentUser();
  const userId = asUserId(user);
  const concert = await ensureConcert(concertPayload);
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("wishlists")
    .upsert({ user_id: userId, concert_id: concert.id, created_at }, { onConflict: "user_id,concert_id" })
    .select()
    .single();
  if (error) throw error;
  await createNotification(userId, {
    type: "UPCOMING_SHOW_REMINDER",
    title: "Saved to wishlist",
    message: `We'll watch ${concert.artist} at ${concert.venue || concert.location || "TBD"} for ticket updates.`,
  });
  notifyTicketSignals(userId, concert);
  return { concert, wishlist: data };
};

const removeWishlist = async (wishlistId) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { error } = await supabase.from("wishlists").delete().eq("id", wishlistId).eq("user_id", userId);
  if (error) throw error;
  return true;
};

const notifyTicketSignals = async (userId, concert) => {
  const status = (concert.ticket_status || "").toLowerCase();
  if (!status) return;
  if (status.includes("low") || status.includes("limited")) {
    await createNotification(userId, {
      type: "LOW_TICKETS",
      title: "Low tickets alert",
      message: `${concert.artist} at ${concert.venue || concert.location || "TBD"} is showing limited availability.`,
    });
  }
  if (status.includes("sold")) {
    await createNotification(userId, {
      type: "LOW_TICKETS",
      title: "Sold out warning",
      message: `${concert.artist} appears sold out. Watch for resale or venue releases.`,
    });
  }
  if (concert._previous) {
    const prevMin = concert._previous.min_price;
    if (concert.min_price && prevMin && Number(concert.min_price) < Number(prevMin)) {
      await createNotification(userId, {
        type: "PRICE_DROP",
        title: "Price drop",
        message: `${concert.artist} tickets dropped to $${concert.min_price}.`,
      });
    }
  }
};

// ---------- Notifications (exported helper for reminders) ----------
export const createUserNotification = async ({ type = "GENERAL", title = "", message = "" }) => {
  const user = currentUser();
  const userId = asUserId(user);
  const created_at = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .insert([{ user_id: userId, type, title, message, is_read: false, created_at }]);
  if (error) throw error;
  return true;
};

export const upsertReminder = async (concertId, remind_days_before = 2) => {
  // Soft-implementation: create a notification row as a reminder marker.
  const user = currentUser();
  const userId = asUserId(user);
  await createUserNotification({
    type: "UPCOMING_SHOW_REMINDER",
    title: "Reminder set",
    message: `We'll remind you ${remind_days_before} days before your show.`,
  });
  // Persist minimal reminder data in localStorage to avoid new schema dependence.
  const key = "trackmygig_reminders";
  const existing = JSON.parse(localStorage.getItem(key) || "{}");
  existing[concertId] = { remind_days_before };
  localStorage.setItem(key, JSON.stringify(existing));
};

export const getReminderSettings = () => {
  const key = "trackmygig_reminders";
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
};

// ---------- Reviews ----------
const saveReview = async ({ concert_id, rating, comment }) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase
    .from("reviews")
    .upsert({ user_id: userId, concert_id, rating, comment, created_at: new Date().toISOString() }, { onConflict: "user_id,concert_id" })
    .select()
    .single();
  if (error) throw error;
  const { data: concert } = await supabase.from("concerts").select("*").eq("id", concert_id).maybeSingle();
  if (concert) {
    await createNotification(userId, {
      type: "review",
      title: "Review posted",
      message: `You rated ${concert.artist || "a concert"} ${rating}/5.`,
    });
  }
  return data;
};

const getReviews = async (concertId) => {
  const { data, error } = await supabase.from("reviews").select("*, users(full_name)").eq("concert_id", concertId);
  if (error) throw error;
  const ratings = data?.map((r) => r.rating).filter((n) => typeof n === "number") || [];
  const count = ratings.length;
  const avgRating = count ? ratings.reduce((a, b) => a + b, 0) / count : null;
  return {
    reviews: data?.map((row) => ({ ...row, full_name: row.users?.full_name })) || [],
    average: avgRating,
    count,
  };
};

// ---------- Journal ----------
const getJournal = async () => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, concerts(title, artist, location, date, venue)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    artist: row.concerts?.artist,
    title: row.concerts?.title,
    location: row.concerts?.location,
    date: row.concerts?.date,
    venue: row.concerts?.venue,
  }));
};

const saveJournalEntry = async ({ concert_id, entry_text, mood, attended_at }) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data: concert } = await supabase.from("concerts").select("*").eq("id", concert_id).maybeSingle();
  const totalCount = await supabase.from("journal_entries").select("*", { count: "exact", head: true }).eq("user_id", userId);
  const artistEntries = await supabase
    .from("journal_entries")
    .select("id, concerts(artist)")
    .eq("user_id", userId);
  const artistCount = (artistEntries.data || []).filter((row) => row?.concerts?.artist === concert?.artist).length;
  let badge_type = "Concert Explorer Badge";
  if ((totalCount.count || 0) === 0) badge_type = "First Gig Badge";
  else if (artistCount >= 2) badge_type = "Super Fan Badge";
  const created_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("journal_entries")
    .insert([{ user_id: userId, concert_id, entry_text, mood, attended_at, badge_type, created_at }])
    .select()
    .single();
  if (error) throw error;
  await createNotification(userId, {
    type: "journal",
    title: badge_type,
    message: `You logged ${concert?.artist || "a concert"} and earned ${badge_type}.`,
  });
  return data;
};

const updateJournalEntry = async (entryId, patch) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase
    .from("journal_entries")
    .update(patch)
    .eq("id", entryId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
};

const deleteJournalEntry = async (entryId) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { error } = await supabase.from("journal_entries").delete().eq("id", entryId).eq("user_id", userId);
  if (error) throw error;
  return true;
};

// ---------- Profile ----------
const getProfile = async () => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  const [favCount, journalCount, badgeCount] = await Promise.all([
    supabase.from("favorites").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("journal_entries").select("*", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("journal_entries")
      .select("badge_type")
      .eq("user_id", userId)
      .not("badge_type", "is", null),
  ]);
  const badges = new Set((badgeCount.data || []).map((r) => r.badge_type)).size;
  const stats = { favorites: favCount.count || 0, journals: journalCount.count || 0, badges };
  return { user: data, stats };
};

const updateProfile = async (payload) => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase.from("users").update(payload).eq("id", userId).select().single();
  if (error) throw error;
  const { password_hash, ...safeUser } = data;
  setAuth(String(data.id), safeUser);
  return safeUser;
};

// ---------- Notifications ----------
const getNotifications = async () => {
  const user = currentUser();
  const userId = asUserId(user);
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

const markNotificationsRead = async (ids) => {
  const user = currentUser();
  const userId = asUserId(user);
  const query = supabase.from("notifications").update({ is_read: true }).eq("user_id", userId);
  if (ids?.length) query.in("id", ids);
  const { error } = await query;
  if (error) throw error;
  return true;
};

const deleteNotifications = async (ids) => {
  const user = currentUser();
  const userId = asUserId(user);
  const query = supabase.from("notifications").delete().eq("user_id", userId);
  if (ids?.length) query.in("id", ids);
  const { error } = await query;
  if (error) throw error;
  return true;
};

const createNotification = async (userId, { type, title, message }) => {
  const created_at = new Date().toISOString();
  await supabase
    .from("notifications")
    .insert([{ user_id: userId, type, title, message, is_read: false, created_at }]);
};

// ---------- Concert search (Ticketmaster direct) ----------
// Replace before deploying; ideally route through a proxy/Edge Function to keep this private.
const TICKETMASTER_API_KEY = "";
const TICKETMASTER_BASE_URL = "https://app.ticketmaster.com/discovery/v2";
// If you deploy a Supabase Edge Function proxy to avoid CORS, set its URL here:
const TICKETMASTER_PROXY_URL = "https://ugldbwwpjcjtfhlpxbip.functions.supabase.co/ticketmaster";
// Optional: if you deploy a chatbot Edge Function (Ticketmaster + OpenAI), set it here:
const CHATBOT_PROXY_URL = "https://ugldbwwpjcjtfhlpxbip.functions.supabase.co/chatbot";
const MUSIC_SEGMENT_ID = "KZFzniwnSyZfZ7v7nJ";

const mapEvent = (event) => {
  const artist = event?._embedded?.attractions?.[0]?.name || event.name;
  const venue = event?._embedded?.venues?.[0];
  const locationParts = [];
  if (venue?.city?.name) locationParts.push(venue.city.name);
  if (venue?.state?.stateCode) locationParts.push(venue.state.stateCode);
  const location = locationParts.filter(Boolean).join(", ");
  const priceRange = event?.priceRanges?.[0];
  const min_price = priceRange?.min || null;
  const max_price = priceRange?.max || null;
  const ticket_status = event?.dates?.status?.code || event?.ticketAvailability?.status || null;
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
    min_price,
    max_price,
    ticket_status,
  };
};

const searchTicketmaster = async (params) => {
  // Prefer proxy if available (avoids CORS and keeps key server-side)
  if (!TICKETMASTER_API_KEY && !TICKETMASTER_PROXY_URL) {
    throw new Error("Ticket search unavailable (no proxy configured).");
  }
  const searchParams = new URLSearchParams({ apikey: TICKETMASTER_API_KEY, size: "20" });
  Object.entries(params).forEach(([k, v]) => {
    if (v) searchParams.append(k, v);
  });
  searchParams.append("segmentId", MUSIC_SEGMENT_ID);
  searchParams.append("segmentName", "Music");
  const url = `${TICKETMASTER_BASE_URL}/events.json?${searchParams.toString()}`;
  const target = TICKETMASTER_PROXY_URL ? `${TICKETMASTER_PROXY_URL}?${searchParams.toString()}` : url;
  const res = await fetch(target);
  const data = await res.json();
  if (!res.ok) {
    const message = data?.fault?.faultstring || data?.errors?.[0]?.detail || "Ticketmaster error";
    throw new Error(message);
  }
  return (data?._embedded?.events || []).map(mapEvent);
};

// ---------- Lightweight "AI" chatbot ----------
const chatbotReply = async ({ message }) => {
  const prompt = (message || "").trim();
  if (!prompt) throw new Error("Message required");
  let city = "";
  let genre = "";
  let keyword = prompt;
  // Try to enrich with profile
  try {
    const { user } = await getProfile();
    if (!city && user?.city) city = user.city;
    if (!genre && user?.favorite_genre) genre = user.favorite_genre;
    if (!keyword && user?.favorite_artists) keyword = user.favorite_artists.split(",")[0] || "";
  } catch {
    // ignore profile errors
  }
  // If a chatbot proxy is configured, prefer it (keeps keys server-side)
  if (CHATBOT_PROXY_URL) {
    const res = await fetch(CHATBOT_PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt, city, genre, keyword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Chatbot unavailable");
    if (data.events?.length) {
      const html = `<ul>${data.events
        .slice(0, 3)
        .map((ev) => {
          const date = ev.date ? new Date(ev.date).toLocaleDateString() : "TBD";
          const venue = ev.venue || ev.location || "TBD";
          const ticket = ev.ticket_url ? `<a href="${ev.ticket_url}" target="_blank" rel="noopener">tickets</a>` : "tickets";
          return `<li><strong>${ev.artist || ev.title}</strong> — ${venue} on ${date} (${ticket})</li>`;
        })
        .join("")}</ul>`;
      return { reply: data.reply || "Here are some options:", html };
    }
    return { reply: data.reply || "Try another artist or city.", html: "" };
  }

  // If no proxy, try client-side TM + optional OpenAI (requires keys set here)
  const params = {};
  if (keyword) params.keyword = keyword;
  if (city) params.city = city;
  if (genre) params.classificationName = genre;
  params.size = "6";
  try {
    const events = await searchTicketmaster(params);
    const top = events.slice(0, 3);
    if (top.length) {
      const reply = `Here are ${top.length} options${city ? ` near ${city}` : ""}${genre ? ` for ${genre}` : ""}:`;
      const html = `<ul>${top
        .map((ev) => {
          const date = ev.date ? new Date(ev.date).toLocaleDateString() : "TBD";
          const venue = ev.venue || ev.location || "TBD";
          const ticket = ev.ticket_url
            ? `<a href="${ev.ticket_url}" target="_blank" rel="noopener">tickets</a>`
            : "tickets";
          return `<li><strong>${ev.artist || ev.title}</strong> — ${venue} on ${date} (${ticket})</li>`;
        })
        .join("")}</ul>`;
      return { reply, html };
    }
  } catch {
    // ignore and fall back
  }

  if (OPENAI_API_KEY) {
    const system = "You are a concise concert assistant. Give 2-3 options or practical tips in under 80 words.";
    const userPrompt = `Question: ${prompt}. City: ${city || "unknown"}. Genre: ${genre || "any"}.`;
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
          { role: "system", content: system },
          { role: "user", content: userPrompt },
          { role: "system", content: "If you lack real events, suggest searching by a nearby major city and keep it short." },
        ],
      }),
    });
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || "Try another artist or city.";
    return { reply: text, html: "" };
  }

  return { reply: "No shows matched and no AI fallback configured. Try another artist or city.", html: "" };
};

// ---------- API facade mimicking old endpoints ----------
const parsePath = (path) => path.replace(/^\/api\//, "");

export const apiPost = async (path, body) => {
  const route = parsePath(path);
  if (route === "auth/signup") return signup(body);
  if (route === "auth/login") return login(body);
  if (route === "chatbot") return chatbotReply(body);
  if (route === "favorites") return addFavorite(body);
  if (route === "wishlist") return addWishlist(body);
  if (route === "reviews") return { review: await saveReview(body) };
  if (route === "journal") return { entry: await saveJournalEntry(body) };
  if (route.startsWith("journal/")) {
    const id = route.split("/")[1];
    return { entry: await updateJournalEntry(id, body) };
  }
  if (route === "profile") return { user: await updateProfile(body) };
  if (route === "notifications/mark-read") return { success: await markNotificationsRead(body?.ids) };
  if (route === "notifications") return { success: await deleteNotifications(body?.ids) };
  throw new Error(`Unknown POST route: ${path}`);
};

export const apiGet = async (path) => {
  const route = parsePath(path);
  if (route === "auth/me") {
    const user = currentUser();
    if (!user) throw new Error("Not logged in");
    const { data, error } = await supabase.from("users").select("*").eq("id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("User not found");
    const { password_hash, ...safeUser } = data;
    return { user: safeUser };
  }
  if (route === "favorites") return { favorites: await fetchFavorites() };
  if (route === "wishlist") return { wishlist: await fetchWishlist() };
  if (route.startsWith("reviews/")) {
    const id = route.split("/")[1];
    return await getReviews(id);
  }
  if (route === "journal") return { entries: await getJournal() };
  if (route === "profile") return await getProfile();
  if (route === "notifications") return { notifications: await getNotifications() };
  if (route.startsWith("concerts/search")) {
    const query = path.split("?")[1] || "";
    const params = Object.fromEntries(new URLSearchParams(query).entries());
    const searchParams = {};
    if (params.keyword) searchParams.keyword = params.keyword;
    if (params.city) searchParams.city = params.city;
    if (params.classificationName) searchParams.classificationName = params.classificationName;
    if (params.startDate) searchParams.startDateTime = `${params.startDate}T00:00:00Z`;
    if (params.endDate) searchParams.endDateTime = `${params.endDate}T23:59:59Z`;
    const events = await searchTicketmaster(searchParams);
    return { events };
  }
  if (route === "concerts/recommended") {
    const { user } = await getProfile();
    const params = {};
    if (user?.city) params.city = user.city;
    if (user?.favorite_genre) params.classificationName = user.favorite_genre;
    const artists = user?.favorite_artists
      ? user.favorite_artists
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    params.keyword = artists[0] || user?.favorite_genre || "";
    const events = await searchTicketmaster(params);
    return { events };
  }
  throw new Error(`Unknown GET route: ${path}`);
};

export const apiPut = async (path, body) => {
  const route = parsePath(path);
  if (route.startsWith("journal/")) {
    const id = route.split("/")[1];
    return { entry: await updateJournalEntry(id, body) };
  }
  if (route === "profile") return { user: await updateProfile(body) };
  throw new Error(`Unknown PUT route: ${path}`);
};

export const apiDelete = async (path) => {
  const route = parsePath(path);
  if (route.startsWith("favorites/")) {
    const id = route.split("/")[1];
    await removeFavorite(id);
    return { success: true };
  }
  if (route.startsWith("wishlist/")) {
    const id = route.split("/")[1];
    await removeWishlist(id);
    return { success: true };
  }
  if (route.startsWith("journal/")) {
    const id = route.split("/")[1];
    return { success: await deleteJournalEntry(id) };
  }
  if (route === "notifications") return { success: await deleteNotifications() };
  throw new Error(`Unknown DELETE route: ${path}`);
};

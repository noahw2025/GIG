// ====== Supabase init ======
const SUPABASE_URL = "https://nshivifdkkovjpbfqlex.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zaGl2aWZka2tvdmpwYmZxbGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDQ2MDQsImV4cCI6MjA3NjM4MDYwNH0.GoLV4wfw7XUUc1zWW46VYXQFwlW3Op-uaCykDN7NxrE";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ====== Ticketmaster init ======
const TM_API_KEY = "XGvK4u2R0e0cHGGXz23sP7PLy9MvJeAK";

// In-memory cache of concerts for search/filter (Ticketmaster events)
let allConcerts = [];
// Basic profile data for personalization
let currentUserProfile = null;
// Track current user id for "recently viewed" key
let currentUserId = null;

// ---------- Small helpers ----------
function formatTime(localTimeStr) {
  if (!localTimeStr) return "";
  const parts = localTimeStr.split(":");
  if (parts.length < 2) return localTimeStr;

  let hour = parseInt(parts[0], 10);
  const minute = parts[1];
  if (Number.isNaN(hour)) return localTimeStr;

  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;

  return `${hour}:${minute} ${ampm}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ====== Section switching ======
function showSection(sectionId) {
  document
    .querySelectorAll(".page-section")
    .forEach((sec) => sec.classList.add("hidden"));
  const target = document.getElementById(sectionId);
  if (target) target.classList.remove("hidden");

  if (sectionId === "profile") loadProfile();
  if (sectionId === "favorites") loadFavorites();
}

// 🔙 Global helper to go back from detail to browse
function goBackToBrowse() {
  const browseSection = document.getElementById("browse");
  const detailSection = document.getElementById("concertDetail");
  if (detailSection) detailSection.classList.add("hidden");
  if (browseSection) browseSection.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ====== Auth ======
async function handleSignUp() {
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  const { error } = await supabase.auth.signUp({ email, password });

  if (error) {
    alert("Sign-up failed: " + error.message);
  } else {
    alert("Account created successfully!");
    window.location.href = "dashboard.html";
  }
}

async function handleLogin() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert("Login failed: " + error.message);
  } else {
    window.location.href = "dashboard.html";
  }
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

// ====== Profile (for personalization + profile page) ======
async function fetchCurrentUserProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select("full_name, favorite_artists, favorite_genre, city")
    .eq("id", userId)
    .single();

  if (!error && data) {
    currentUserProfile = data;
  }
  return data;
}

async function loadProfile() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;

  if (!currentUserProfile) {
    await fetchCurrentUserProfile(user.id);
  }

  const data = currentUserProfile || {};

  const nameInput = document.getElementById("profileName");
  const favArtistsInput = document.getElementById("favoriteArtists");
  const favGenreInput = document.getElementById("favoriteGenre");
  const cityInput = document.getElementById("profileCity");

  if (nameInput) nameInput.value = data.full_name || "";
  if (favArtistsInput) favArtistsInput.value = data.favorite_artists || "";
  if (favGenreInput) favGenreInput.value = data.favorite_genre || "";
  if (cityInput) cityInput.value = data.city || "";
}

async function updateProfile() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;

  const updates = {
    id: user.id,
    full_name: document.getElementById("profileName").value,
    favorite_artists: document.getElementById("favoriteArtists").value,
    favorite_genre: document.getElementById("favoriteGenre").value,
    city: document.getElementById("profileCity").value,
  };

  const { error } = await supabase.from("users").upsert(updates);

  const status = document.getElementById("profileStatus");
  if (error) {
    if (status) {
      status.textContent = "Error saving profile.";
      status.style.color = "red";
    }
  } else {
    if (status) {
      status.textContent = "Profile updated successfully!";
      status.style.color = "green";
    }
    currentUserProfile = updates;
    updateBrowseMessage();
    renderRecommended(); // will now use Ticketmaster based on profile
  }
}

// ====== Ticketmaster fetch helper ======
async function fetchTicketmasterEvents(options = {}) {
  const { keyword, city, genre } = options;

  const params = new URLSearchParams({
    apikey: TM_API_KEY,
    countryCode: "US",
    size: "50",
    sort: "date,asc",
  });

  // genre maps to classificationName, default to "music"
  params.append("classificationName", genre || "music");

  if (keyword) {
    params.append("keyword", keyword);
  }

  if (city) {
    params.append("city", city);
  }

  const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Ticketmaster error: ${res.status}`);
  }

  const data = await res.json();
  const events = data._embedded?.events || [];

  // Normalize to shape our app expects
  return events.map((e) => {
    const venue =
      (e._embedded && e._embedded.venues && e._embedded.venues[0]) || {};
    const cityName = (venue.city && venue.city.name) || "";
    const stateName =
      (venue.state && (venue.state.name || venue.state.stateCode)) || "";
    const location = [cityName, stateName].filter(Boolean).join(", ");
    const genreName =
      (e.classifications &&
        e.classifications[0] &&
        e.classifications[0].genre &&
        e.classifications[0].genre.name) || "";
    const venueName = venue.name || "";
    const date = e.dates?.start?.localDate || "";
    const time = e.dates?.start?.localTime || "";

    return {
      id: e.id, // Ticketmaster id (string) – used for "recently viewed"
      artist: e.name,
      location,
      date,
      time,
      venue: venueName,
      description: e.info || e.pleaseNote || "",
      genre: genreName,
      ticketUrl: e.url,
    };
  });
}

// ====== Concerts (from Ticketmaster) + Search/Filter ======
async function loadConcerts() {
  const concertList = document.getElementById("concertList");

  try {
    // Initial load: general US music events (no city restriction)
    const events = await fetchTicketmasterEvents({});
    allConcerts = events || [];

    if (!allConcerts.length && concertList) {
      concertList.innerHTML = "<p>No concerts found.</p>";
      return;
    }

    populateLocationFilter();
    applyConcertFilters();
    renderRecommended();
    renderRecentList();
  } catch (error) {
    console.error("Error loading concerts from Ticketmaster:", error);
    if (concertList) {
      concertList.innerHTML =
        "<p>Error loading concerts. Please try again later.</p>";
    }
  }
}

function renderConcerts(concerts) {
  const concertList = document.getElementById("concertList");
  if (!concertList) return;

  concertList.innerHTML = "";

  if (!concerts || concerts.length === 0) {
    concertList.innerHTML = "<p>No concerts found for this search.</p>";
    return;
  }

  concerts.forEach((concert) => {
    const div = document.createElement("div");
    div.classList.add("concert-card");

    const dateText = concert.date || "Date TBA";
    const locationText = concert.location || "Location TBA";
    const timeText = formatTime(concert.time);

    div.innerHTML = `
      <h3>${escapeHtml(concert.artist)}</h3>
      <p>
        ${escapeHtml(locationText)} — ${escapeHtml(dateText)}
        ${timeText ? ` • ${escapeHtml(timeText)}` : ""}
      </p>
      <div class="card-actions" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
        <button class="detail-btn">
          More Details
        </button>
        <button class="fav-btn">
          ⭐ Add to Favorites
        </button>
        ${
          concert.ticketUrl
            ? `<button class="ticket-btn">🎫 View Tickets</button>`
            : ""
        }
      </div>
    `;

    const detailBtn = div.querySelector(".detail-btn");
    detailBtn.addEventListener("click", () => {
      showConcertDetail(concert);
      markRecentlyViewed(concert.id);
    });

    const favBtn = div.querySelector(".fav-btn");
    favBtn.addEventListener("click", () => {
      addToFavoritesFromAPI(concert);
      markRecentlyViewed(concert.id);
    });

    const ticketBtn = div.querySelector(".ticket-btn");
    if (ticketBtn && concert.ticketUrl) {
      ticketBtn.addEventListener("click", () => {
        window.open(concert.ticketUrl, "_blank");
      });
    }

    concertList.appendChild(div);
  });
}

function populateLocationFilter() {
  const select = document.getElementById("locationFilter");
  if (!select) return;

  const previous = select.value;

  const locations = Array.from(
    new Set(
      (allConcerts || [])
        .map((c) => c.location)
        .filter((loc) => loc && loc.trim().length > 0)
    )
  );

  select.innerHTML = '<option value="">All Locations</option>';
  locations.forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    select.appendChild(opt);
  });

  if (locations.includes(previous)) {
    select.value = previous;
  } else {
    select.value = "";
  }
}

function applyConcertFilters() {
  let filtered = allConcerts.slice();

  const searchInput = document.getElementById("searchInput");
  const locationFilter = document.getElementById("locationFilter");

  const term = searchInput?.value.trim().toLowerCase() || "";
  const locVal = locationFilter?.value || "";

  if (term) {
    filtered = filtered.filter((c) => {
      const artist = (c.artist || "").toLowerCase();
      const location = (c.location || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      const genre = (c.genre || "").toLowerCase();
      return (
        artist.includes(term) ||
        location.includes(term) ||
        desc.includes(term) ||
        genre.includes(term)
      );
    });
  }

  if (locVal) {
    filtered = filtered.filter((c) => c.location === locVal);
  }

  renderConcerts(filtered);

  // If user searched something and nothing matched, hit Ticketmaster again
  if (term && filtered.length === 0) {
    searchRemoteConcerts(term, locVal);
  }
}

// When local filter has no matches, pull fresh results from Ticketmaster
async function searchRemoteConcerts(term, locVal) {
  try {
    const keyword = term;
    const city = locVal ? locVal.split(",")[0].trim() : "";

    const events = await fetchTicketmasterEvents({
      keyword,
      city,
    });

    allConcerts = events || [];
    populateLocationFilter();

    // Re-apply filters to the new data
    let filtered = allConcerts.slice();

    if (keyword) {
      const t = keyword.toLowerCase();
      filtered = filtered.filter((c) => {
        const artist = (c.artist || "").toLowerCase();
        const location = (c.location || "").toLowerCase();
        const desc = (c.description || "").toLowerCase();
        const genre = (c.genre || "").toLowerCase();
        return (
          artist.includes(t) ||
          location.includes(t) ||
          desc.includes(t) ||
          genre.includes(t)
        );
      });
    }

    if (locVal) {
      filtered = filtered.filter((c) => c.location === locVal);
    }

    renderConcerts(filtered);
    renderRecommended();
  } catch (err) {
    console.error("Remote search error:", err);
  }
}

// ====== Concert Detail view ======
function showConcertDetail(concert) {
  const browseSection = document.getElementById("browse");
  const detailSection = document.getElementById("concertDetail");
  const detailContent = document.getElementById("concertDetailContent");
  if (!browseSection || !detailSection || !detailContent) return;

  // Switch sections
  browseSection.classList.add("hidden");
  detailSection.classList.remove("hidden");

  const locationText = concert.location || "Location TBA";
  const dateText = concert.date || "Date TBA";
  const timeText = formatTime(concert.time);
  const venueText = concert.venue || "";

  // Build consistent description block
  const descriptionParts = [];
  if (concert.description && concert.description.toLowerCase() !== "undefined") {
    descriptionParts.push(concert.description);
  }
  if (concert.genre) {
    descriptionParts.push(`Genre: ${concert.genre}`);
  }
  if (!descriptionParts.length) {
    descriptionParts.push(
      "No additional details are available for this event yet. Check the ticket page for more information."
    );
  }

  const descriptionHtml = descriptionParts
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");

  detailContent.innerHTML = `
    <h2>${escapeHtml(concert.artist)}</h2>
    <p class="detail-subtitle">
      ${venueText ? `${escapeHtml(venueText)}<br />` : ""}
      ${escapeHtml(locationText)} — ${escapeHtml(dateText)}${
        timeText ? ` • ${escapeHtml(timeText)}` : ""
      }
    </p>
    <div class="detail-description">
      ${descriptionHtml}
    </div>
    <div class="detail-actions">
      <button class="detail-fav-btn">⭐ Add to Favorites</button>
      ${
        concert.ticketUrl
          ? `<button class="detail-ticket-btn">🎫 View Tickets</button>`
          : ""
      }
      <button class="detail-share-btn">🔗 Share Concert Details</button>
    </div>
  `;

  // Add to favorites
  const favBtn = detailContent.querySelector(".detail-fav-btn");
  if (favBtn) {
    favBtn.addEventListener("click", () => addToFavoritesFromAPI(concert));
  }

  // View tickets
  const ticketBtn = detailContent.querySelector(".detail-ticket-btn");
  if (ticketBtn && concert.ticketUrl) {
    ticketBtn.addEventListener("click", () =>
      window.open(concert.ticketUrl, "_blank")
    );
  }

  // Share concert details (simple link back to TrackMyGig)
  const shareBtn = detailContent.querySelector(".detail-share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => shareSimpleConcertLink(concert));
  }
}

// 👇 Set this to your actual GitHub Pages dashboard URL
// Example: "https://your-username.github.io/trackmygig/dashboard.html"
const PRODUCTION_DASHBOARD_URL =
  "https://noahw2025.github.io/GIG/dashboard.html";

function shareSimpleConcertLink(concert) {
  // Always share the LIVE site dashboard with an event_id query param
  const shareUrl = `${PRODUCTION_DASHBOARD_URL}?event_id=${encodeURIComponent(
    concert.id
  )}`;

  if (navigator.share) {
    navigator
      .share({
        title: `Concert: ${concert.artist}`,
        text: "Check out this concert I found on TrackMyGig!",
        url: shareUrl,
      })
      .catch(() => {
        // user cancelled, ignore
      });
    return;
  }

  // Fallback: copy to clipboard or show the link
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => alert("Share link copied to clipboard!"))
      .catch(() => alert(shareUrl));
  } else {
    alert(shareUrl);
  }
}


// ====== Personalized: Browse message ======
function updateBrowseMessage() {
  const msg = document.getElementById("browseMessage");
  if (!msg) return;

  if (currentUserProfile?.city) {
    msg.textContent = `Personalized: try looking for shows near ${currentUserProfile.city}.`;
  } else if (currentUserProfile?.favorite_genre) {
    msg.textContent = `Personalized: keep an eye out for ${currentUserProfile.favorite_genre} concerts.`;
  } else {
    msg.textContent = "";
  }
}

function setupBrowseControls() {
  const searchInput = document.getElementById("searchInput");
  const locationFilter = document.getElementById("locationFilter");

  if (searchInput) {
    searchInput.addEventListener("input", applyConcertFilters);
  }
  if (locationFilter) {
    locationFilter.addEventListener("change", applyConcertFilters);
  }

  updateBrowseMessage();
}

// ====== Personalized: Recommended concerts (Ticketmaster-based) ======
async function renderRecommended() {
  const container = document.getElementById("recommendedList");
  if (!container) return;

  if (!currentUserProfile) {
    container.innerHTML =
      '<p class="empty-state-small">Fill out your profile to see personalized picks.</p>';
    return;
  }

  container.innerHTML =
    "<p class='empty-state-small'>Loading recommendations...</p>";

  const favArtistsStr =
    (currentUserProfile.favorite_artists || "").toLowerCase();
  const favArtists = favArtistsStr
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  // Use just the city name before any comma
  const rawCity = (currentUserProfile.city || "").trim();
  const city = rawCity.split(",")[0].trim() || "";
  const genre = (currentUserProfile.favorite_genre || "").trim();

  if (!favArtists.length && !city && !genre) {
    container.innerHTML =
      '<p class="empty-state-small">Add a favorite artist, genre, or city to get recommendations.</p>';
    return;
  }

  try {
    // Primary query: first favorite artist + city + genre (if provided)
    const primaryEvents = await fetchTicketmasterEvents({
      keyword: favArtists[0] || undefined,
      city: city || undefined,
      genre: genre || undefined,
    });

    let events = primaryEvents;

    // Fallback 1: just city + genre
    if (!events.length && city) {
      events = await fetchTicketmasterEvents({
        city,
        genre: genre || undefined,
      });
    }

    // Fallback 2: just genre
    if (!events.length && genre) {
      events = await fetchTicketmasterEvents({
        genre,
      });
    }

    // Fallback 3: generic music
    if (!events.length) {
      events = await fetchTicketmasterEvents({});
    }

    if (!events.length) {
      container.innerHTML =
        '<p class="empty-state-small">No recommendations found yet. Try broadening your preferences.</p>';
      return;
    }

    container.innerHTML = "";
    events.slice(0, 5).forEach((concert) => {
      const pill = document.createElement("button");
      pill.className = "personalized-pill";
      pill.textContent = `${concert.artist} — ${
        concert.location || "Location TBA"
      }`;

      pill.addEventListener("click", () => {
        showConcertDetail(concert);
        markRecentlyViewed(concert.id);
      });

      container.appendChild(pill);
    });
  } catch (err) {
    console.error("Error loading recommended events:", err);
    container.innerHTML =
      "<p class='empty-state-small'>Couldn't load recommendations right now.</p>";
  }
}

// ====== Personalized: Recently viewed ======
function getRecentKey() {
  return `recent_${currentUserId || "anon"}`;
}

function markRecentlyViewed(concertId) {
  const key = getRecentKey();
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  const filtered = existing.filter((id) => id !== concertId);
  filtered.unshift(concertId);

  const trimmed = filtered.slice(0, 5);
  localStorage.setItem(key, JSON.stringify(trimmed));

  renderRecentList();
}

function renderRecentList() {
  const container = document.getElementById("recentList");
  if (!container) return;

  if (!allConcerts.length) {
    container.innerHTML =
      '<p class="empty-state-small">No recent concerts yet.</p>';
    return;
  }

  const key = getRecentKey();
  const ids = JSON.parse(localStorage.getItem(key) || "[]");

  const recentConcerts = ids
    .map((id) => allConcerts.find((c) => c.id === id))
    .filter(Boolean);

  if (!recentConcerts.length) {
    container.innerHTML =
      '<p class="empty-state-small">No recent concerts yet.</p>';
    return;
  }

  container.innerHTML = "";
  recentConcerts.forEach((concert) => {
    const pill = document.createElement("button");
    pill.className = "personalized-pill";
    pill.textContent = `${concert.artist} — ${
      concert.location || "Location TBA"
    }`;
    pill.addEventListener("click", () => {
      showConcertDetail(concert);
    });
    container.appendChild(pill);
  });
}

// ====== Favorites (add, view, remove) + Reviews ======

// Map a Ticketmaster event into Supabase concerts + favorites
async function addToFavoritesFromAPI(concert) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    alert("Please log in first.");
    return;
  }

  let concertId = null;

  const { data: existingConcerts, error: findError } = await supabase
    .from("concerts")
    .select("id")
    .eq("artist", concert.artist)
    .eq("location", concert.location)
    .eq("date", concert.date || null)
    .limit(1);

  if (findError) {
    alert("Error checking concerts: " + findError.message);
    return;
  }

  if (existingConcerts && existingConcerts.length > 0) {
    concertId = existingConcerts[0].id;
  } else {
    const insertPayload = {
      artist: concert.artist,
      location: concert.location,
      date: concert.date || null,
      description: concert.ticketUrl
        ? `Ticket URL: ${concert.ticketUrl}`
        : concert.description || null,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("concerts")
      .insert([insertPayload])
      .select("id")
      .single();

    if (insertError) {
      alert("Error saving concert: " + insertError.message);
      return;
    }

    concertId = inserted.id;
  }

  await addToFavorites(concertId, concert.artist);
}

async function addToFavorites(concertId, artist) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    alert("Please log in first.");
    return;
  }

  const { data: existing, error: checkError } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("concert_id", concertId);

  if (checkError) {
    alert("Error checking favorites: " + checkError.message);
    return;
  }

  if (existing && existing.length > 0) {
    alert(`${artist} is already in your favorites.`);
    return;
  }

  const { error } = await supabase
    .from("favorites")
    .insert([{ user_id: user.id, concert_id: concertId }]);

  if (error) {
    alert("Error adding favorite: " + error.message);
  } else {
    await loadFavorites();
    alert(`${artist} added to your favorites!`);
  }
}

async function loadFavorites() {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) return;

  const favDiv = document.getElementById("favoritesList");
  favDiv.innerHTML = "";

  const { data: favorites, error } = await supabase
    .from("favorites")
    .select("id, concert_id, concerts(artist, location, date)")
    .eq("user_id", user.id)
    .order("id", { ascending: true });

  if (error) {
    favDiv.innerHTML = `<p>Error loading favorites: ${error.message}</p>`;
    return;
  }

  if (!favorites || favorites.length === 0) {
    favDiv.innerHTML = "<p>No favorites yet.</p>";
    return;
  }

  const concertIds = favorites.map((f) => f.concert_id);
  let reviewsByConcert = {};

  if (concertIds.length > 0) {
    const { data: reviews, error: revError } = await supabase
      .from("reviews")
      .select("concert_id, rating, comment")
      .eq("user_id", user.id)
      .in("concert_id", concertIds);

    if (!revError && reviews) {
      reviews.forEach((r) => {
        reviewsByConcert[r.concert_id] = r;
      });
    }
  }

  favorites.forEach((fav) => {
    const c = fav.concerts;
    const review = reviewsByConcert[fav.concert_id];

    const ratingValue = review ? review.rating : 5;
    const commentValue = review ? review.comment || "" : "";
    const commentEscaped = commentValue.replace(/"/g, "&quot;");

    const reviewSummaryText = review
      ? `Your review: ${review.rating} ★${
          review.comment ? " – " + review.comment : ""
        }`
      : "You haven't left a review for this concert yet.";

    const div = document.createElement("div");
    div.classList.add("concert-card");
    div.innerHTML = `
      <div class="favorite-main">
        <span><strong>${escapeHtml(
          c.artist
        )}</strong> — ${escapeHtml(c.location)} (${escapeHtml(c.date)})</span>
        <button class="remove-btn" onclick="removeFavorite('${fav.id}')">× Remove</button>
      </div>

      <div class="review-summary">
        ${escapeHtml(reviewSummaryText)}
      </div>

      <div class="review-controls">
        <label>
          Your rating:
          <select id="rating-${fav.concert_id}">
            <option value="5" ${ratingValue === 5 ? "selected" : ""}>5 ★</option>
            <option value="4" ${ratingValue === 4 ? "selected" : ""}>4 ★</option>
            <option value="3" ${ratingValue === 3 ? "selected" : ""}>3 ★</option>
            <option value="2" ${ratingValue === 2 ? "selected" : ""}>2 ★</option>
            <option value="1" ${ratingValue === 1 ? "selected" : ""}>1 ★</option>
          </select>
        </label>
        <input
          type="text"
          id="comment-${fav.concert_id}"
          placeholder="Add a short review..."
          value="${commentEscaped}"
        />
        <button
          type="button"
          class="review-save-btn"
          onclick="submitReview(${fav.concert_id})"
        >
          Save
        </button>
      </div>
    `;
    favDiv.appendChild(div);
  });
}

async function removeFavorite(favoriteId) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    alert("Please log in first.");
    return;
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("id", favoriteId)
    .eq("user_id", user.id);

  if (error) {
    alert("Error removing favorite: " + error.message);
    return;
  }

  await loadFavorites();
}

// ====== Reviews (per favorite) ======
async function submitReview(concertId) {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;
  if (!user) {
    alert("Please log in first.");
    return;
  }

  const ratingSelect = document.getElementById(`rating-${concertId}`);
  const commentInput = document.getElementById(`comment-${concertId}`);

  if (!ratingSelect || !commentInput) {
    alert("Review controls not found.");
    return;
  }

  const rating = parseInt(ratingSelect.value, 10);
  const comment = commentInput.value.trim();

  if (!rating || rating < 1 || rating > 5) {
    alert("Please choose a rating between 1 and 5.");
    return;
  }

  const { data: existing, error: fetchError } = await supabase
    .from("reviews")
    .select("id")
    .eq("user_id", user.id)
    .eq("concert_id", concertId)
    .maybeSingle();

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("Error checking review:", fetchError);
  }

  if (existing) {
    const { error } = await supabase
      .from("reviews")
      .update({ rating, comment })
      .eq("id", existing.id);

    if (error) {
      alert("Error updating review: " + error.message);
      return;
    }
  } else {
    const { error } = await supabase
      .from("reviews")
      .insert([{ user_id: user.id, concert_id: concertId, rating, comment }]);

    if (error) {
      alert("Error saving review: " + error.message);
      return;
    }
  }

  await loadFavorites();
  alert("Review saved!");
}

// ====== Handle shared event links (?event_id=...) ======
async function checkForSharedEvent() {
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get("event_id");
  if (!eventId) return;

  const target = allConcerts.find((c) => c.id === eventId);
  if (target) {
    showConcertDetail(target);
    markRecentlyViewed(eventId);
  } else {
    console.warn("Shared event not found in loaded concerts.");
  }
}

// ====== Auto-init on dashboard ======
if (window.location.pathname.endsWith("dashboard.html")) {
  (async () => {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      window.location.href = "index.html";
      return;
    }

    currentUserId = user.id;

    await fetchCurrentUserProfile(user.id);
    await loadConcerts();
    await checkForSharedEvent(); // open shared concert if link has ?event_id=
    await loadFavorites();
    setupBrowseControls();
    // back button is wired inline with goBackToBrowse()
  })();
}


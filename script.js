// ====== Supabase init ======
const SUPABASE_URL = "https://nshivifdkkovjpbfqlex.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zaGl2aWZka2tvdmpwYmZxbGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA4MDQ2MDQsImV4cCI6MjA3NjM4MDYwNH0.GoLV4wfw7XUUc1zWW46VYXQFwlW3Op-uaCykDN7NxrE";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// In-memory cache of concerts for search/filter
let allConcerts = [];
// Basic profile data for personalization
let currentUserProfile = null;

// ====== Section switching ======
function showSection(sectionId) {
  document
    .querySelectorAll(".page-section")
    .forEach((sec) => sec.classList.add("hidden"));
  document.getElementById(sectionId).classList.remove("hidden");

  if (sectionId === "profile") loadProfile();
  if (sectionId === "favorites") loadFavorites();
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

  document.getElementById("profileName").value = data.full_name || "";
  document.getElementById("favoriteArtists").value =
    data.favorite_artists || "";
  document.getElementById("favoriteGenre").value =
    data.favorite_genre || "";
  document.getElementById("profileCity").value = data.city || "";
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
    status.textContent = "Error saving profile.";
    status.style.color = "red";
  } else {
    status.textContent = "Profile updated successfully!";
    status.style.color = "green";
    currentUserProfile = updates;
  }
}

// ====== Concerts (from DB) + Search/Filter/Personalization ======
async function loadConcerts() {
  const { data, error } = await supabase
    .from("concerts")
    .select("*")
    .order("date", { ascending: true });

  if (error) {
    console.error("Error loading concerts:", error);
    const concertList = document.getElementById("concertList");
    if (concertList) {
      concertList.innerHTML =
        "<p>Error loading concerts. Please try again later.</p>";
    }
    return;
  }

  allConcerts = data || [];
  populateLocationFilter();
  applyConcertFilters();
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
    div.innerHTML = `
      <h3>${concert.artist}</h3>
      <p>${concert.location || "Location TBA"} — ${
      concert.date || "Date TBA"
    }</p>
      <button onclick="addToFavorites(${
        concert.id
      }, '${concert.artist.replace(/'/g, "\\'")}')">
        ⭐ Add to Favorites
      </button>
    `;
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
      return (
        artist.includes(term) ||
        location.includes(term) ||
        desc.includes(term)
      );
    });
  }

  if (locVal) {
    filtered = filtered.filter((c) => c.location === locVal);
  }

  renderConcerts(filtered);
}

function setupBrowseControls() {
  const searchInput = document.getElementById("searchInput");
  const locationFilter = document.getElementById("locationFilter");
  const msg = document.getElementById("browseMessage");

  if (searchInput) {
    searchInput.addEventListener("input", applyConcertFilters);
  }
  if (locationFilter) {
    locationFilter.addEventListener("change", applyConcertFilters);
  }

  if (msg) {
    if (currentUserProfile?.city) {
      msg.textContent = `Personalized: try looking for shows near ${currentUserProfile.city}.`;
    } else if (currentUserProfile?.favorite_genre) {
      msg.textContent = `Personalized: keep an eye out for ${currentUserProfile.favorite_genre} concerts.`;
    } else {
      msg.textContent = "";
    }
  }
}

// ====== Favorites (add, view, remove) + Reviews ======
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

  // ---- Fetch existing reviews for these concerts ----
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

  // ---- Render favorites with review summary + controls ----
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
        <span><strong>${c.artist}</strong> — ${c.location} (${c.date})</span>
        <button class="remove-btn" onclick="removeFavorite('${fav.id}')">× Remove</button>
      </div>

      <div class="review-summary">
        ${reviewSummaryText}
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

  // Refresh favorites so the summary text and fields stay in sync
  await loadFavorites();
  alert("Review saved!");
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

    await fetchCurrentUserProfile(user.id);
    await loadConcerts();
    await loadFavorites();
    setupBrowseControls();
  })();
}

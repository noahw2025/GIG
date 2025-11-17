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
// =========================
// FAVORITES + REVIEWS
// =========================

// Call this when you need to show the Favorites section
// e.g., from showSection('favorites') or on initial dashboard load.
async function loadFavoritesSection() {
  const user = await getCurrentUser();
  if (!user) return;

  const favoritesContainer = document.getElementById('favoritesList');
  if (!favoritesContainer) return;

  favoritesContainer.innerHTML = '<p>Loading favorites...</p>';

  // 1) Get favorites with joined concert info
  const { data: favorites, error: favError } = await supabase
    .from('favorites')
    .select(`
      id,
      concert_id,
      concerts (
        artist,
        location,
        date
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (favError) {
    console.error('Error loading favorites:', favError);
    favoritesContainer.innerHTML = '<p>Could not load favorites.</p>';
    return;
  }

  if (!favorites || favorites.length === 0) {
    favoritesContainer.innerHTML = '<p>You have no favorites yet.</p>';
    return;
  }

  // 2) Collect concert IDs for this user's favorites
  const concertIds = [...new Set(favorites.map(f => f.concert_id))];

  // 3) Fetch this user's reviews for those concerts
  let reviewsByConcert = {};
  if (concertIds.length > 0) {
    const { data: reviews, error: reviewError } = await supabase
      .from('reviews')
      .select('id, concert_id, rating, comment')
      .eq('user_id', user.id)
      .in('concert_id', concertIds);

    if (reviewError) {
      console.error('Error loading reviews:', reviewError);
    } else if (reviews) {
      reviews.forEach(r => {
        reviewsByConcert[r.concert_id] = r;
      });
    }
  }

  // 4) Render favorites with prefilled review controls
  favoritesContainer.innerHTML = '';
  favorites.forEach(fav => {
    const concert = fav.concerts;
    const concertId = fav.concert_id;
    const review = reviewsByConcert[concertId] || null;

    const card = document.createElement('div');
    card.className = 'concert-card favorite-card';

    // Safely format date
    let dateStr = '';
    if (concert.date) {
      try {
        dateStr = new Date(concert.date).toISOString().split('T')[0];
      } catch {
        dateStr = concert.date;
      }
    }

    // Build rating options with the existing rating selected if present
    const currentRating = review && review.rating ? review.rating : 5;
    const ratingOptions = [1, 2, 3, 4, 5]
      .map(
        (r) => `<option value="${r}" ${r === currentRating ? 'selected' : ''}>${r}</option>`
      )
      .join('');

    const commentText = review && review.comment ? review.comment : '';

    const statusText = review
      ? 'Your review is saved.'
      : '';

    card.innerHTML = `
      <div class="favorite-top-row">
        <div class="favorite-title">
          <strong>${concert.artist}</strong> — ${concert.location} (${dateStr})
        </div>
        <button
          class="remove-favorite-btn"
          data-favorite-id="${fav.id}"
        >
          × Remove
        </button>
      </div>

      <div class="favorite-review-block">
        <label class="favorite-review-label">
          Your rating:
          <select
            class="review-rating-select"
            data-concert-id="${concertId}"
          >
            ${ratingOptions}
          </select>
        </label>

        <textarea
          class="review-comment-input"
          data-concert-id="${concertId}"
          placeholder="Add a short review..."
        >${commentText}</textarea>

        <div class="favorite-review-footer">
          <button
            class="save-review-btn"
            data-concert-id="${concertId}"
          >
            Save Review
          </button>
          <small
            class="review-status-text"
            data-concert-id="${concertId}"
          >
            ${statusText}
          </small>
        </div>
      </div>
    `;

    favoritesContainer.appendChild(card);
  });

  // Wire up remove + save-review buttons
  favoritesContainer.querySelectorAll('.remove-favorite-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const favId = e.currentTarget.getAttribute('data-favorite-id');
      await removeFavorite(favId);
      await loadFavoritesSection(); // refresh list
    });
  });

  favoritesContainer.querySelectorAll('.save-review-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const concertId = parseInt(
        e.currentTarget.getAttribute('data-concert-id'),
        10
      );
      await saveReviewForConcert(concertId);
    });
  });
}

/**
 * Insert or update the review for this user + concert,
 * then update the little status text in the card.
 */
async function saveReviewForConcert(concertId) {
  const user = await getCurrentUser();
  if (!user) return;

  const ratingEl = document.querySelector(
    `.review-rating-select[data-concert-id="${concertId}"]`
  );
  const commentEl = document.querySelector(
    `.review-comment-input[data-concert-id="${concertId}"]`
  );
  const statusEl = document.querySelector(
    `.review-status-text[data-concert-id="${concertId}"]`
  );

  if (!ratingEl || !commentEl || !statusEl) return;

  const rating = parseInt(ratingEl.value, 10) || null;
  const comment = commentEl.value.trim();

  if (!rating && !comment) {
    statusEl.textContent = 'Nothing to save.';
    return;
  }

  // See if a review already exists for this user + concert
  const { data: existing, error: selectError } = await supabase
    .from('reviews')
    .select('id')
    .eq('user_id', user.id)
    .eq('concert_id', concertId)
    .maybeSingle();

  if (selectError) {
    console.error('Error checking existing review:', selectError);
    statusEl.textContent = 'Error saving review.';
    return;
  }

  let upsertError = null;

  if (existing && existing.id) {
    // Update existing
    const { error } = await supabase
      .from('reviews')
      .update({
        rating,
        comment,
      })
      .eq('id', existing.id);
    upsertError = error;
  } else {
    // Insert new
    const { error } = await supabase.from('reviews').insert({
      user_id: user.id,
      concert_id: concertId,
      rating,
      comment,
    });
    upsertError = error;
  }

  if (upsertError) {
    console.error('Error saving review:', upsertError);
    statusEl.textContent = 'Error saving review.';
    return;
  }

  statusEl.textContent = 'Review saved ✔';
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


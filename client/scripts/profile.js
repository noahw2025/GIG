import { apiGet, apiPut, showToast } from "./api.js";

const form = document.getElementById("profileForm");
const statsEl = document.getElementById("profileStats");
const summaryTitle = document.getElementById("profileSummaryTitle");
const summaryBody = document.getElementById("profileSummary");

const renderStats = (stats) => {
  statsEl.innerHTML = `
    <div class="stat-card"><strong>${stats.favorites}</strong><div class="muted">Favorites</div></div>
    <div class="stat-card"><strong>${stats.journals}</strong><div class="muted">Journal entries</div></div>
    <div class="stat-card"><strong>${stats.badges}</strong><div class="muted">Badges</div></div>
  `;
};

export const loadProfile = async () => {
  if (!form) return;
  try {
    const res = await apiGet("/api/profile");
    const { user, stats } = res;
    form.full_name.value = user.full_name || "";
    form.city.value = user.city || "";
    form.favorite_artists.value = user.favorite_artists || "";
    form.favorite_genre.value = user.favorite_genre || "";
    renderStats(stats);
    if (summaryTitle && summaryBody) {
      const artists = user.favorite_artists || "Add artists you love";
      const genre = user.favorite_genre || "Pick a genre";
      const city = user.city || "Your city";
      summaryTitle.textContent = `${city} • ${genre}`;
      summaryBody.textContent = `We will prioritize "${artists}" in searches and keep results to music events in ${city}. Update these to improve recommendations.`;
    }
  } catch (err) {
    showToast("Could not load profile");
  }
};

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    await apiPut("/api/profile", payload);
    showToast("Profile saved");
    loadProfile();
    document.dispatchEvent(new CustomEvent("profile-updated"));
  } catch (err) {
    showToast(err.message);
  }
});

document.addEventListener("DOMContentLoaded", loadProfile);

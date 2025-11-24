import { apiGet, apiPost, formatDate, showToast } from "./api.js";

const searchForm = document.getElementById("searchForm");
const searchResultsEl = document.getElementById("searchResults");
const recommendedEl = document.getElementById("recommended");
const recommendedBtn = document.getElementById("recommendedBtn");
const detailsModal = document.getElementById("detailsModal");
const detailsBody = document.getElementById("detailsBody");

const eventCache = new Map();

const renderEvents = (container, events, emptyLabel) => {
  container.innerHTML =
    events.length === 0
      ? `<div class="card empty">${emptyLabel}</div>`
      : events
          .map(
            (ev) => `<div class="card concert-card" data-ext="${ev.external_id}">
              <div class="pill">${ev.genre || "Concert"}</div>
              <h3>${ev.artist}</h3>
              <div class="meta">
                <span>Location: ${ev.location || "TBD"}</span>
                <span>Date: ${formatDate(ev.date)}</span>
              </div>
              <p class="muted">${ev.title || ""}</p>
              <div class="actions">
                <button class="primary" data-action="favorite">Favorite</button>
                <button class="ghost" data-action="details">Details</button>
                <a class="ghost ticket" href="${ev.ticket_url || "#"}" target="_blank" rel="noopener">Tickets</a>
              </div>
            </div>`
          )
          .join("");
};

const openDetails = (ev) => {
  detailsBody.innerHTML = `
    <h3>${ev.artist}</h3>
    <p class="muted">${ev.title || ""}</p>
    <p>Venue: ${ev.venue || ev.location || "TBD"}</p>
    <p>Date: ${formatDate(ev.date)}</p>
    <p>${ev.description || "No description provided."}</p>
    <a class="primary" href="${ev.ticket_url}" target="_blank">Open tickets</a>
  `;
  detailsModal.classList.remove("hidden");
};

const handleFavorite = async (extId) => {
  const payload = eventCache.get(extId);
  if (!payload) return;
  try {
    await apiPost("/api/favorites", payload);
    showToast("Added to favorites.");
  } catch (err) {
    console.error("Favorite failed", err);
    showToast(err.message);
  }
};

searchForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const params = new URLSearchParams(new FormData(searchForm));
  try {
    renderEvents(searchResultsEl, [], "Searching Ticketmaster...");
    const res = await apiGet(`/api/concerts/search?${params.toString()}`);
    if (res.events) {
      res.events.forEach((ev) => eventCache.set(ev.external_id, ev));
      renderEvents(searchResultsEl, res.events, "No concerts yet. Try a different keyword.");
    } else {
      renderEvents(searchResultsEl, [], res.error || "No concerts found.");
    }
  } catch (err) {
    renderEvents(searchResultsEl, [], err.message || "Could not search concerts.");
  } finally {
    // keep recommendations separate; do not overwrite that section
  }
});

recommendedBtn?.addEventListener("click", async () => {
  try {
    renderEvents(recommendedEl, [], "Loading recommendations...");
    const res = await apiGet("/api/concerts/recommended");
    if (res.events) {
      const limited = res.events.slice(0, 4);
      limited.forEach((ev) => eventCache.set(ev.external_id, ev));
      renderEvents(recommendedEl, limited, "No recommendations yet. Update your profile for better matches.");
    } else {
      renderEvents(recommendedEl, [], res.error || "No recommendations available.");
    }
  } catch (err) {
    renderEvents(recommendedEl, [], err.message || "Could not load recommendations.");
  }
});

document.addEventListener("profile-updated", () => {
  recommendedBtn?.click();
});

[searchResultsEl, recommendedEl].forEach((container) => {
  container?.addEventListener("click", (e) => {
    const card = e.target.closest(".concert-card");
    if (!card) return;
    const extId = card.dataset.ext;
    if (e.target.dataset.action === "favorite") {
      handleFavorite(extId);
    }
    if (e.target.dataset.action === "details") {
      const ev = eventCache.get(extId);
      if (ev) openDetails(ev);
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  recommendedBtn?.click();
});

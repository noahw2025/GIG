import { apiGet, apiPost, showToast, formatDate } from "./api.js";
import { openDetails, cacheEvent } from "./browse.js";

const listEl = document.getElementById("recommendationList");
const recCache = new Map();

const formatPriceRange = (ev) => {
  if (ev.min_price && ev.max_price) return `$${ev.min_price} - $${ev.max_price}`;
  if (ev.min_price) return `Tickets from $${ev.min_price}`;
  if (ev.max_price) return `Up to $${ev.max_price}`;
  return "";
};

const formatStatus = (status) => {
  if (!status) return null;
  const code = String(status).toLowerCase();
  if (code.includes("sold")) return { label: "Sold out", className: "chip-muted" };
  if (code.includes("limited") || code.includes("low")) return { label: "Limited", className: "chip-genre" };
  if (code.includes("available") || code.includes("onsale")) return { label: "Available", className: "chip-positive" };
  return { label: status, className: "chip-muted" };
};

const buildMapLink = (ev) => {
  const venue = ev.venue || "";
  const loc = ev.location || "";
  const query = `${venue} ${loc}`.trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const render = (events) => {
  if (!listEl) return;
  if (!events.length) {
    listEl.innerHTML = `<div class="card empty">No recommendations yet. Update your profile and refresh.</div>`;
    return;
  }
  listEl.innerHTML = events
    .map((ev) => {
      recCache.set(ev.external_id, ev);
      cacheEvent(ev);
      const price = formatPriceRange(ev);
      const status = formatStatus(ev.ticket_status);
      const mapLink = buildMapLink(ev);
      return `<div class="card rec-card" data-ext="${ev.external_id}">
        <div class="floating-actions">
          <div class="pill">${ev.genre || "Concert"}</div>
          ${status ? `<span class="chip ${status.className}">${status.label}</span>` : ""}
        </div>
        <h3>${ev.artist}</h3>
        <p class="muted">${ev.title || ""}</p>
        <div class="meta">
          <span>${ev.venue || ev.location || "Venue TBA"}</span>
          <span>${formatDate(ev.date)}</span>
          ${price ? `<span>${price}</span>` : ""}
          ${mapLink ? `<a class="ghost small-btn" href="${mapLink}" target="_blank" rel="noopener">Map</a>` : ""}
        </div>
        <div class="actions">
          <button class="primary action-pill" data-act="favorite">Add to Favorites</button>
          <button class="ghost action-pill" data-act="wishlist">Add to Wishlist</button>
          <button class="ghost action-pill" data-act="details">Details</button>
          <button class="ghost action-pill" data-act="share">Share</button>
          <a class="primary action-pill" href="${ev.ticket_url || "#"}" target="_blank" rel="noopener">Book Tickets</a>
        </div>
      </div>`;
    })
    .join("");
};

const loadRecommendations = async () => {
  if (!listEl) return;
  try {
    const res = await apiGet("/api/concerts/recommended");
    render(res.events || []);
  } catch (err) {
    listEl.innerHTML = `<div class="card empty">${err.message || "Could not load recommendations."}</div>`;
  }
};

listEl?.addEventListener("click", async (e) => {
  const card = e.target.closest(".rec-card");
  if (!card) return;
  const extId = card.dataset.ext;
  const ev = recCache.get(extId);
  if (!ev) return;
  const act = e.target.dataset.act;
  if (act === "favorite") {
    try {
      await apiPost("/api/favorites", ev);
      showToast("Added to favorites");
    } catch (err) {
      showToast(err.message);
    }
  }
  if (act === "wishlist") {
    try {
      await apiPost("/api/wishlist", ev);
      showToast("Added to wishlist");
    } catch (err) {
      showToast(err.message);
    }
  }
  if (act === "share") {
    const url = `${window.location.origin}/dashboard.html?concertId=${encodeURIComponent(ev.external_id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: ev.title || ev.artist, text: "Check this show", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    } catch {
      showToast("Could not share right now.");
    }
  }
  if (act === "details") {
    openDetails(ev);
  }
});

document.addEventListener("DOMContentLoaded", loadRecommendations);

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
        <div class="card-actions">
          <button class="primary" data-act="favorite">Add to Favorites</button>
          <button class="ghost" data-act="wishlist">Add to Wishlist</button>
          <button class="ghost" data-act="details">Details</button>
          <a class="primary" href="${ev.ticket_url || "#"}" target="_blank" rel="noopener">Book Tickets</a>
          <button class="ghost subtle" data-act="share">Share</button>
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
    handleShare(ev, card);
  }
  if (act === "details") {
    openDetails(ev);
  }
});

document.addEventListener("DOMContentLoaded", loadRecommendations);

let sharePopover = null;
const handleShare = (item, card) => {
  const url = `${window.location.origin}/dashboard.html?concertId=${encodeURIComponent(item.external_id)}`;
  if (sharePopover) {
    sharePopover.remove();
    sharePopover = null;
  }
  const menu = document.createElement("div");
  menu.className = "share-menu";
  menu.innerHTML = `
    <button class="ghost" data-share="copy">Copy link</button>
    <button class="ghost" data-share="device">Share via device</button>
    <button class="ghost" data-share="invite">Invite a friend...</button>
  `;
  card.appendChild(menu);
  sharePopover = menu;
  menu.addEventListener("click", async (e) => {
    const action = e.target.dataset.share;
    if (!action) return;
    if (action === "copy") {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    }
    if (action === "device" && navigator.share) {
      await navigator.share({ title: item.title || item.artist, text: "Check this show", url });
    }
    if (action === "invite") {
      const inviteModal = document.getElementById("inviteModal");
      const inviteMsg = document.getElementById("inviteMessage");
      const mailto = document.getElementById("mailtoInvite");
      if (inviteModal && inviteMsg) {
        const msg = `I'm thinking of going to ${item.artist || item.title || "this show"} on ${formatDate(item.date)}. Link: ${url}`;
        inviteMsg.value = msg;
        mailto.href = `mailto:?subject=Join me at a show&body=${encodeURIComponent(msg)}`;
        inviteModal.classList.remove("hidden");
      }
    }
  });
};

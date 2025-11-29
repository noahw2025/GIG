import { apiGet, apiPost, formatDate, showToast } from "./api.js";

const searchForm = document.getElementById("searchForm");
const searchResultsEl = document.getElementById("searchResults");
const detailsModal = document.getElementById("detailsModal");
const detailsBody = document.getElementById("detailsBody");
let sharePopover = null;

const eventCache = new Map();
const reminderKey = "trackmygig_reminders";

const renderEvents = (container, events, emptyLabel) => {
  container.innerHTML =
    events.length === 0
      ? `<div class="card empty">${emptyLabel}</div>`
      : events
          .map((ev) => {
            const venue = ev.venue || ev.location || "Venue TBA";
            const date = formatDate(ev.date);
            const price = formatPriceRange(ev);
            const status = formatStatus(ev.ticket_status);
            const mapLink = buildMapLink(ev);
            return `<div class="card concert-card" data-ext="${ev.external_id}">
              <div class="floating-actions">
                <span class="pill pill-strong">${ev.genre || "Concert"}</span>
                <span class="pill">${venue}</span>
                ${status ? `<span class="chip ${status.className}">${status.label}</span>` : ""}
              </div>
              <h3>${ev.artist}</h3>
              <p class="muted">${ev.title || ""}</p>
              <div class="meta">
                <span>${date}</span>
                ${price ? `<span>${price}</span>` : ""}
                ${mapLink ? `<a class="ghost small-btn" href="${mapLink}" target="_blank" rel="noopener">Map</a>` : ""}
              </div>
              <div class="card-actions">
                <button class="primary" data-action="favorite">Add to Favorites</button>
                <button class="ghost" data-action="wishlist">Add to Wishlist</button>
                <button class="ghost" data-action="details">Details</button>
                <a class="primary" href="${ev.ticket_url || "#"}" target="_blank" rel="noopener">Book Tickets</a>
                <button class="ghost subtle" data-action="share">Share</button>
              </div>
            </div>`;
          })
          .join("");
};

export const cacheEvent = (ev) => {
  if (!ev?.external_id) return;
  eventCache.set(ev.external_id, ev);
};

const fetchVenueShows = async (venue, location) => {
  try {
    const res = await apiGet(`/api/concerts/search?keyword=${encodeURIComponent(venue || "")}&city=${encodeURIComponent(location || "")}`);
    return res.events || [];
  } catch {
    return [];
  }
};

export const openDetails = async (ev) => {
  const price = formatPriceRange(ev);
  const status = formatStatus(ev.ticket_status);
  const mapLink = buildMapLink(ev);
  const venueShows = ev.venue ? await fetchVenueShows(ev.venue, ev.location) : [];
  detailsBody.innerHTML = `
    <div class="modal-head">
      <div>
        <h3>${ev.artist || ev.title || "Concert"}</h3>
        <p class="muted">${ev.title || ""}</p>
        <div class="meta">
          <span>${formatDate(ev.date)}</span>
          ${price ? `<span>${price}</span>` : ""}
        </div>
      </div>
      ${status ? `<span class="chip ${status.className}">${status.label}</span>` : ""}
    </div>
    <div class="modal-section">
      <h4>Venue & Map</h4>
      <p>${ev.venue || ev.location || "TBD"}</p>
      ${mapLink ? `<a class="ghost" href="${mapLink}" target="_blank" rel="noopener">Open in Maps</a>` : ""}
      ${
        mapLink
          ? `<div class="modal-map"><iframe title="map" src="https://www.google.com/maps?q=${encodeURIComponent(
              `${ev.venue || ""} ${ev.location || ""}`
            )}&output=embed" width="100%" height="200" style="border:0;" loading="lazy"></iframe></div>`
          : ""
      }
      ${
        venueShows.length
          ? `<div class="mini-meta">Upcoming at this venue:</div>
            <div class="card-row">${venueShows
              .slice(0, 3)
              .map(
                (v) => `<div class="mini-card">
                  <div class="pill">${v.genre || "Concert"}</div>
                  <strong>${v.artist || v.title || "Concert"}</strong>
                  <div class="mini-meta">${v.date ? formatDate(v.date) : "TBD"}</div>
                </div>`
              )
              .join("")}</div>`
          : ""
      }
    </div>
    <div class="modal-section">
      <h4>Event details</h4>
      <p>${ev.description || "No description provided."}</p>
    </div>
    <div class="card-actions">
      <button class="primary" data-action="favorite" data-ext="${ev.external_id}">Add to Favorites</button>
      <button class="ghost" data-action="wishlist" data-ext="${ev.external_id}">Add to Wishlist</button>
      <button class="ghost" data-action="details" data-ext="${ev.external_id}">Details</button>
      <a class="primary" href="${ev.ticket_url}" target="_blank">Book tickets</a>
      <button class="ghost subtle" data-action="share" data-ext="${ev.external_id}">Share</button>
      <button class="ghost" data-action="reminder" data-ext="${ev.external_id}">${isReminderOn(ev.id) ? "Reminder on" : "Remind me"}</button>
    </div>
  `;
  cacheEvent(ev);
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

const handleWishlist = async (extId) => {
  const payload = eventCache.get(extId);
  if (!payload) return;
  try {
    await apiPost("/api/wishlist", payload);
    showToast("Added to wishlist.");
  } catch (err) {
    console.error("Wishlist failed", err);
    showToast(err.message);
  }
};

const handleShare = async (extId, anchorEl) => {
  const payload = eventCache.get(extId);
  if (!payload) return;
  const url = `${window.location.origin}/dashboard.html?concertId=${encodeURIComponent(payload.external_id)}`;
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
  anchorEl?.parentElement?.appendChild(menu);
  sharePopover = menu;
  menu.addEventListener("click", async (e) => {
    const action = e.target.dataset.share;
    if (!action) return;
    if (action === "copy") {
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    }
    if (action === "device" && navigator.share) {
      await navigator.share({ title: payload.title || payload.artist, text: "Check this show", url });
    }
    if (action === "invite") {
      const inviteModal = document.getElementById("inviteModal");
      const inviteMsg = document.getElementById("inviteMessage");
      const mailto = document.getElementById("mailtoInvite");
      if (inviteModal && inviteMsg) {
        const msg = `I'm thinking of going to ${payload.artist || payload.title || "this show"} at ${payload.venue || payload.location || "a venue"} on ${formatDate(
          payload.date
        )}. Here's the link: ${url}. Want to come?`;
        inviteMsg.value = msg;
        mailto.href = `mailto:?subject=Join me at a show&body=${encodeURIComponent(msg)}`;
        inviteModal.classList.remove("hidden");
      }
    }
  });
};

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

const reminderSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(reminderKey) || "{}");
  } catch {
    return {};
  }
};
const isReminderOn = (concertId) => Boolean(reminderSettings()[concertId]);
const toggleReminder = (concertId) => {
  const settings = reminderSettings();
  if (settings[concertId]) {
    delete settings[concertId];
    localStorage.setItem(reminderKey, JSON.stringify(settings));
    showToast("Reminder removed");
    return;
  }
  settings[concertId] = { remind_days_before: 2 };
  localStorage.setItem(reminderKey, JSON.stringify(settings));
  showToast("Reminder set");
};

searchForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const params = new URLSearchParams(new FormData(searchForm));
  try {
    renderEvents(searchResultsEl, [], "Searching Ticketmaster...");
    const res = await apiGet(`/api/concerts/search?${params.toString()}`);
    if (res.events) {
      res.events.forEach((ev) => cacheEvent(ev));
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

document.addEventListener("profile-updated", () => {
  // Recommendations moved to dedicated tab; nothing to refresh here
});

[searchResultsEl].forEach((container) => {
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
    if (e.target.dataset.action === "wishlist") {
      handleWishlist(extId);
    }
    if (e.target.dataset.action === "share") {
      handleShare(extId, e.target);
    }
    if (e.target.dataset.action === "reminder") {
      toggleReminder(extId);
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  // no-op
});

detailsModal?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const extId = btn.dataset.ext;
  if (!extId) return;
  if (btn.dataset.action === "favorite") handleFavorite(extId);
  if (btn.dataset.action === "wishlist") handleWishlist(extId);
  if (btn.dataset.action === "share") handleShare(extId);
});

import { apiDelete, apiGet, apiPost, apiPut, formatDate, showToast } from "./api.js";
import { openDetails, cacheEvent } from "./browse.js";
import { loadJournal } from "./journal.js";

const listEl = document.getElementById("favoritesList");
const reviewModal = document.getElementById("reviewModal");
const reviewForm = document.getElementById("reviewForm");
const journalModal = document.getElementById("journalModal");
const journalForm = document.getElementById("journalForm");
const shareModal = document.getElementById("shareModal");
const shareLink = document.getElementById("shareLink");
const copyShare = document.getElementById("copyShare");
let sharePopover = null;

let favorites = [];

export const loadFavorites = async () => {
  try {
    const res = await apiGet("/api/favorites");
    favorites = res.favorites;
    render();
  } catch (err) {
    listEl.innerHTML = `<div class="card empty">${err.message}</div>`;
  }
};

const render = () => {
  if (!favorites.length) {
    listEl.innerHTML = `<div class="card empty">No favorites yet. Add some from Browse.</div>`;
    return;
  }
  listEl.innerHTML = favorites
    .map((f) => {
      const reviewBlock = f.user_review
        ? `<div class="chip chip-positive">Your review ${f.user_review.rating}/5</div><div class="review-quote">"${f.user_review.comment || "No comment"}"</div>`
        : `<div class="chip chip-muted">No review yet</div>`;
      const genre = f.genre ? `<span class="chip chip-genre">${f.genre}</span>` : "";
      const status = formatStatus(f.ticket_status);
      const price =
        f.min_price && f.max_price
          ? `$${f.min_price} - $${f.max_price}`
          : f.min_price
          ? `From $${f.min_price}`
          : f.max_price
          ? `Up to $${f.max_price}`
          : "";
      const mapLink = buildMapLink(f);
      return `<div class="card fav-card" data-fav="${f.favorite_id}" data-concert="${f.id}">
        <div class="floating-actions">
          <div class="pill">Favorited ${formatDate(f.favorited_at)}</div>
          ${genre}
          ${status ? `<span class="chip ${status.className}">${status.label}</span>` : ""}
        </div>
        <h3>${f.artist}</h3>
        <p class="muted">${f.title || ""}</p>
        <div class="meta">
          <span>${f.venue || f.location || "Venue TBA"}</span>
          <span>${formatDate(f.date)}</span>
          ${price ? `<span>${price}</span>` : ""}
          ${mapLink ? `<a class="ghost small-btn" href="${mapLink}" target="_blank" rel="noopener">Map</a>` : ""}
        </div>
        ${reviewBlock}
        <div class="card-actions">
          <button class="primary" data-act="review">Review this show</button>
          <button class="ghost" data-act="journal">Log in Journal</button>
          <button class="ghost" data-act="details">Details</button>
          <a class="primary" href="${f.ticket_url || "#"}" target="_blank" rel="noopener">Book Tickets</a>
          <button class="ghost subtle" data-act="share">Share</button>
          <button class="ghost" data-act="remove">Remove</button>
        </div>
      </div>`;
    })
    .join("");
};

listEl?.addEventListener("click", async (e) => {
  const card = e.target.closest(".fav-card");
  if (!card) return;
  const favoriteId = card.dataset.fav;
  const concertId = card.dataset.concert;
  const act = e.target.dataset.act;
  if (act === "remove") {
    await apiDelete(`/api/favorites/${favoriteId}`);
    showToast("Removed favorite");
    loadFavorites();
  }
  if (act === "review") {
    reviewForm.concert_id.value = concertId;
    reviewModal.classList.remove("hidden");
  }
  if (act === "journal") {
    journalForm.concert_id.value = concertId;
    journalModal.classList.remove("hidden");
  }
  if (act === "share") {
    const item = favorites.find((x) => String(x.favorite_id) === String(favoriteId));
    const ref = item?.external_id || card.dataset.concert;
    handleShare(ref, card);
  }
  if (act === "details") {
    const item = favorites.find((x) => String(x.favorite_id) === String(favoriteId));
    if (item) {
      cacheEvent(item);
      openDetails(item);
    }
  }
});

reviewForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(reviewForm).entries());
  data.rating = Number(data.rating);
  try {
    await apiPost("/api/reviews", data);
    showToast("Review saved");
    reviewModal.classList.add("hidden");
    loadFavorites();
  } catch (err) {
    showToast(err.message);
  }
});

journalForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(journalForm).entries());
  const entryId = data.entry_id;
  try {
    if (entryId) {
      await apiPut(`/api/journal/${entryId}`, data);
      showToast("Journal entry updated");
    } else {
      await apiPost("/api/journal", data);
      showToast("Journal entry saved");
    }
    journalModal.classList.add("hidden");
    journalForm.reset();
    journalForm.entry_id.value = "";
    journalForm.concert_id.value = data.concert_id || "";
    loadFavorites();
    loadJournal();
  } catch (err) {
    showToast(err.message);
  }
});

copyShare?.addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareLink.value);
  showToast("Link copied");
});

document.addEventListener("DOMContentLoaded", loadFavorites);

const buildMapLink = (ev) => {
  const venue = ev.venue || "";
  const loc = ev.location || "";
  const query = `${venue} ${loc}`.trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const formatStatus = (status) => {
  if (!status) return null;
  const code = String(status).toLowerCase();
  if (code.includes("sold")) return { label: "Sold out", className: "chip-muted" };
  if (code.includes("limited") || code.includes("low")) return { label: "Limited", className: "chip-genre" };
  if (code.includes("available") || code.includes("onsale")) return { label: "Available", className: "chip-positive" };
  return { label: status, className: "chip-muted" };
};

const reminderKey = "trackmygig_reminders";
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

const handleShare = (externalId, card) => {
  const url = `${window.location.origin}/dashboard.html?concertId=${encodeURIComponent(externalId)}`;
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
      await navigator.share({ title: "Concert", text: "Check this show", url });
    }
    if (action === "invite") {
      const inviteModal = document.getElementById("inviteModal");
      const inviteMsg = document.getElementById("inviteMessage");
      const mailto = document.getElementById("mailtoInvite");
      if (inviteModal && inviteMsg) {
        const msg = `I'm thinking of going to this show. Here's the link: ${url}. Want to come?`;
        inviteMsg.value = msg;
        mailto.href = `mailto:?subject=Join me at a show&body=${encodeURIComponent(msg)}`;
        inviteModal.classList.remove("hidden");
      }
    }
  });
};

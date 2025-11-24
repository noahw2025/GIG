import { apiDelete, apiGet, apiPost, apiPut, formatDate, showToast } from "./api.js";
import { loadJournal } from "./journal.js";

const listEl = document.getElementById("favoritesList");
const reviewModal = document.getElementById("reviewModal");
const reviewForm = document.getElementById("reviewForm");
const journalModal = document.getElementById("journalModal");
const journalForm = document.getElementById("journalForm");
const shareModal = document.getElementById("shareModal");
const shareLink = document.getElementById("shareLink");
const copyShare = document.getElementById("copyShare");

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
        ? `<div class="chip chip-positive">Your review ${f.user_review.rating}/5</div><div class="review-quote">“${f.user_review.comment || "No comment"}”</div>`
        : `<div class="chip chip-muted">No review yet</div>`;
      const genre = f.genre ? `<span class="chip chip-genre">${f.genre}</span>` : "";
      return `<div class="card fav-card" data-fav="${f.favorite_id}" data-concert="${f.id}">
        <div class="card-top">
          <div class="pill">Favorited ${formatDate(f.favorited_at)}</div>
          ${genre}
        </div>
        <h3>${f.artist}</h3>
        <div class="meta">
          <span>Location: ${f.location || "TBD"}</span>
          <span>Date: ${formatDate(f.date)}</span>
          ${f.venue ? `<span>Venue: ${f.venue}</span>` : ""}
        </div>
        ${reviewBlock}
        <div class="actions">
          <button class="primary" data-act="review">Review</button>
          <button class="ghost" data-act="journal">Mark attended</button>
          <button class="ghost" data-act="share">Invite</button>
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
    shareLink.value = `https://trackmygig.local/concert/${concertId}`;
    shareModal.classList.remove("hidden");
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

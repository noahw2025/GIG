import { apiDelete, apiGet, formatDate, showToast } from "./api.js";

const journalList = document.getElementById("journalList");
let journalCache = [];

export const loadJournal = async () => {
  if (!journalList) return;
  try {
    const res = await apiGet("/api/journal");
    journalCache = res.entries || [];
    if (!journalCache.length) {
      journalList.innerHTML = `<div class="card empty">No journal entries yet. Mark a favorite as attended.</div>`;
      return;
    }
    const cards = journalCache
      .map(
        (j) => `<div class="card" data-entry="${j.id}">
          <div class="floating-actions">
            <div class="pill">${formatDate(j.attended_at || j.date)} · ${j.mood || "Mood?"}</div>
            <div class="chip">${j.badge_type || "Concert Explorer Badge"}</div>
          </div>
          <strong>${j.artist} — ${j.title || ""}</strong>
          <p class="muted">${j.venue || j.location || "Location TBA"}</p>
          <p>${j.entry_text}</p>
          <div class="actions">
            <button type="button" class="ghost small-btn" data-action="edit">Edit</button>
            <button type="button" class="ghost small-btn" data-action="delete">Remove entry</button>
          </div>
        </div>`
      )
      .join("");
    journalList.innerHTML = `<div class="timeline">${cards}</div>`;
  } catch (err) {
    showToast("Could not load journal");
  }
};

journalList?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const card = btn.closest("[data-entry]");
  if (!card) return;
  const id = card.dataset.entry;
  const entry = journalCache.find((item) => String(item.id) === String(id));
  if (!entry) return;

  if (btn.dataset.action === "delete") {
    try {
      await apiDelete(`/api/journal/${id}`);
      showToast("Journal entry removed");
      loadJournal();
    } catch (err) {
      showToast(err.message);
    }
  }

  if (btn.dataset.action === "edit") {
    const journalForm = document.getElementById("journalForm");
    journalForm.entry_id.value = entry.id;
    journalForm.concert_id.value = entry.concert_id;
    journalForm.entry_text.value = entry.entry_text || "";
    journalForm.mood.value = entry.mood || "";
    journalForm.attended_at.value = entry.attended_at ? entry.attended_at.split("T")[0] : "";
    document.getElementById("journalModal").classList.remove("hidden");
  }
});

document.addEventListener("DOMContentLoaded", loadJournal);

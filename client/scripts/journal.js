import { apiDelete, apiGet, formatDate, showToast } from "./api.js";

const journalList = document.getElementById("journalList");
let journalCache = [];
const certificateModal = document.getElementById("certificateModal");
const certTextEl = document.getElementById("certText");
const certBadgesEl = document.getElementById("certBadges");
const certIdEl = document.getElementById("certId");
const copyCertBtn = document.getElementById("copyCertText");

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
            <button type="button" class="ghost small-btn" data-action="certificate">View certificate</button>
            <a class="ghost small-btn" href="${buildMapLink(j)}" target="_blank" rel="noopener">Map</a>
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

  if (btn.dataset.action === "certificate") {
    renderCertificate(entry);
  }
});

document.addEventListener("DOMContentLoaded", loadJournal);

const renderCertificate = (entry) => {
  if (!certificateModal) return;
  const name = JSON.parse(localStorage.getItem("trackmygig_user") || "{}")?.full_name || "TrackMyGig fan";
  const date = entry.attended_at || entry.date || "";
  const venue = entry.venue || entry.location || "Venue TBA";
  const text = `This certifies that ${name} attended ${entry.artist || entry.title || "a concert"} at ${venue} on ${date ? formatDate(date) : "a past date"}.`;
  certTextEl.textContent = text;
  certBadgesEl.innerHTML = `<span class="chip">${entry.badge_type || "Concert Explorer Badge"}</span>${
    entry.mood ? `<span class="chip chip-genre">Mood: ${entry.mood}</span>` : ""
  }`;
  certIdEl.textContent = `Certificate ID: ${entry.id} · Issued: ${formatDate(entry.created_at || new Date().toISOString())}`;
  certificateModal.classList.remove("hidden");

  copyCertBtn?.addEventListener("click", async () => {
    await navigator.clipboard.writeText(text);
    showToast("Certificate text copied");
  });
};

const buildMapLink = (ev) => {
  const venue = ev.venue || "";
  const loc = ev.location || "";
  const query = `${venue} ${loc}`.trim();
  if (!query) return "https://maps.google.com";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

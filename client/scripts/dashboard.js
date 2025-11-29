import { apiGet, clearAuth, requireAuth, setAuth, showToast, formatDate } from "./api.js";

const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");
const logoutBtn = document.getElementById("logoutBtn");
const userEmailEl = document.getElementById("userEmail");
const soonEl = document.getElementById("homeSoon");
const monthEl = document.getElementById("homeMonth");
const laterEl = document.getElementById("homeLater");
const notificationSnapshotEl = document.getElementById("notificationSnapshot");
const homeRecommendedEl = document.getElementById("homeRecommended");
const homeGenreLabel = document.getElementById("homeGenreLabel");
const addJournalBtn = document.getElementById("addJournalEntry");

requireAuth();

const switchTab = (target) => {
  tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === target));
  panels.forEach((panel) => panel.classList.toggle("active", panel.id === target));
};

tabButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  })
);

logoutBtn?.addEventListener("click", () => {
  clearAuth();
  window.location.href = "./index.html";
});

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.closest(".modal").classList.add("hidden");
  });
});

const loadSelf = async () => {
  try {
    const res = await apiGet("/api/auth/me");
    userEmailEl.textContent = res.user.email;
    setAuth(localStorage.getItem("trackmygig_token"), res.user);
    if (homeGenreLabel) homeGenreLabel.textContent = res.user.favorite_genre || "your genre";
  } catch (err) {
    showToast("Session expired, please log in again.");
    clearAuth();
    window.location.href = "./index.html";
  }
};

const renderRow = (el, items, emptyText) => {
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<div class="muted">${emptyText}</div>`;
    return;
  }
  el.innerHTML = items
    .slice(0, 6)
    .map(
      (item) => `<div class="mini-card">
        <div class="pill">${item.genre || "Concert"}</div>
        <h4>${item.artist || item.title || "Concert"}</h4>
        <div class="mini-meta">${item.venue || item.location || "Venue TBA"}</div>
        <div class="mini-meta">${item.date ? formatDate(item.date) : "TBD"}</div>
        ${item.min_price || item.max_price ? `<div class="mini-meta">${priceLabel(item)}</div>` : ""}
      </div>`
    )
    .join("");
};

const priceLabel = (ev) => {
  if (ev.min_price && ev.max_price) return `$${ev.min_price} - $${ev.max_price}`;
  if (ev.min_price) return `From $${ev.min_price}`;
  if (ev.max_price) return `Up to $${ev.max_price}`;
  return "";
};

const loadSnapshots = async () => {
  try {
    const favorites = (await apiGet("/api/favorites"))?.favorites || [];
    const wishlist = (await apiGet("/api/wishlist"))?.wishlist || [];

    const now = new Date();
    const inDays = (d) => Math.floor((new Date(d) - now) / (1000 * 60 * 60 * 24));

    const soon = favorites.filter((f) => f.date && inDays(f.date) >= 0 && inDays(f.date) <= 14);
    const month = favorites
      .filter((f) => f.date && inDays(f.date) >= 15 && inDays(f.date) <= 31)
      .concat(wishlist.filter((w) => w.date && inDays(w.date) >= 15 && inDays(w.date) <= 31));
    const later = wishlist.filter((w) => !w.date || inDays(w.date) > 31);

    renderRow(soonEl, soon, "No upcoming shows in the next 2 weeks.");
    renderRow(monthEl, month, "No shows later this month.");
    renderRow(laterEl, later, "Nothing saved for later yet.");

    const notifications = (await apiGet("/api/notifications"))?.notifications || [];
    if (notificationSnapshotEl) {
      const snap = notifications.slice(0, 3);
      notificationSnapshotEl.innerHTML =
        snap.length === 0
          ? `<div class="muted">No notifications yet.</div>`
          : snap
              .map(
                (n) => `<div class="mini-meta">
                  <strong>${n.title}</strong> · ${new Date(n.created_at).toLocaleString()}
                  <div>${n.message}</div>
                </div>`
              )
              .join("");
    }
  } catch (err) {
    console.error("Snapshot load failed", err);
  }
};

document.querySelectorAll("[data-tab-jump]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const target = link.getAttribute("data-tab-jump");
    if (target) switchTab(target);
  });
});

addJournalBtn?.addEventListener("click", () => {
  const journalForm = document.getElementById("journalForm");
  journalForm.reset();
  journalForm.entry_id.value = "";
  journalForm.concert_id.value = "";
  document.getElementById("journalModal").classList.remove("hidden");
});

loadSelf();
loadSnapshots();

const renderRecommendedHome = (events) => {
  if (!homeRecommendedEl) return;
  if (!events.length) {
    homeRecommendedEl.innerHTML = `<div class="muted">No recommendations yet. Update your profile for better matches.</div>`;
    return;
  }
  homeRecommendedEl.innerHTML = events
    .slice(0, 3)
    .map(
      (ev) => `<div class="mini-meta">
        <strong>${ev.artist}</strong> · ${ev.venue || ev.location || "Venue TBA"} · ${formatDate(ev.date)}
      </div>`
    )
    .join("");
};

const loadHomeRecommended = async () => {
  try {
    const res = await apiGet("/api/concerts/recommended");
    renderRecommendedHome(res.events || []);
  } catch (err) {
    if (homeRecommendedEl) homeRecommendedEl.innerHTML = `<div class="muted">Could not load recs.</div>`;
  }
};

loadHomeRecommended();

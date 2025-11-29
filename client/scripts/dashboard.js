import { apiGet, clearAuth, requireAuth, setAuth, showToast, formatDate } from "./api.js";

const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");
const logoutBtn = document.getElementById("logoutBtn");
const userEmailEl = document.getElementById("userEmail");
const upcomingEl = document.getElementById("upcomingFavorites");
const wishlistHighlightsEl = document.getElementById("wishlistHighlights");
const notificationSnapshotEl = document.getElementById("notificationSnapshot");
const homeRecommendedEl = document.getElementById("homeRecommended");
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
  } catch (err) {
    showToast("Session expired, please log in again.");
    clearAuth();
    window.location.href = "./index.html";
  }
};

const loadSnapshots = async () => {
  try {
    const favorites = (await apiGet("/api/favorites"))?.favorites || [];
    const upcoming = favorites.filter((f) => f.date && new Date(f.date) > new Date()).slice(0, 3);
    if (upcomingEl) {
      upcomingEl.innerHTML =
        upcoming.length === 0
          ? `<div class="muted">No upcoming shows yet.</div>`
          : upcoming
              .map(
                (f) => `<div class="mini-meta">
                  <strong>${f.artist}</strong> · ${f.venue || f.location || "Venue TBA"} · ${f.date ? new Date(f.date).toLocaleDateString() : "TBD"}
                </div>`
              )
              .join("");
    }
    const wishlist = (await apiGet("/api/wishlist"))?.wishlist || [];
    if (wishlistHighlightsEl) {
      const limited = wishlist.slice(0, 3);
      wishlistHighlightsEl.innerHTML =
        limited.length === 0
          ? `<div class="muted">Nothing in your wishlist.</div>`
          : limited
              .map(
                (w) => `<div class="mini-meta">
                  <strong>${w.artist}</strong> · ${w.venue || w.location || "Venue TBA"} · ${w.date ? new Date(w.date).toLocaleDateString() : "TBD"}
                </div>`
              )
              .join("");
    }
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
    // ignore snapshot errors to avoid blocking load
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

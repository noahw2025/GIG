import { apiDelete, apiGet, apiPost, showToast } from "./api.js";

const bellBtn = document.getElementById("bellBtn");
const panel = document.getElementById("notificationPanel");
const listEl = document.getElementById("notificationList");
const feedEl = document.getElementById("notificationFeed");
const unreadBadge = document.getElementById("unreadBadge");
const markAllButtons = Array.from(document.querySelectorAll("#markAllRead, [data-mark-all]"));
const clearAllButtons = Array.from(document.querySelectorAll("#clearAllNotif, [data-clear-all]"));

let notifications = [];

const render = () => {
  const unread = notifications.filter((n) => !n.is_read).length;
  unreadBadge.textContent = unread;
  unreadBadge.classList.toggle("hidden", unread === 0);
  const content =
    notifications.length === 0
      ? `<div class="notification-card muted">No notifications yet.</div>`
      : notifications
          .map((n) => {
            const meta = formatType(n.type);
            return `<div class="notification-card ${n.is_read ? "muted" : ""}">
              <div class="row" style="justify-content: space-between; display: flex; align-items: center; gap: 8px;">
                <div>
                  <strong>${n.title}</strong>
                  ${meta ? `<span class="chip ${meta.className}">${meta.label}</span>` : ""}
                </div>
                <small>${formatSince(n.created_at)}</small>
              </div>
              <div>${n.message}</div>
            </div>`;
          })
          .join("");
  if (listEl) listEl.innerHTML = content;
  if (feedEl) feedEl.innerHTML = content;
};

export const loadNotifications = async () => {
  try {
    const res = await apiGet("/api/notifications");
    notifications = res.notifications || [];
    render();
  } catch (err) {
    showToast("Could not load notifications");
  }
};

bellBtn?.addEventListener("click", () => {
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) {
    loadNotifications();
  }
});

markAllButtons.forEach((btn) =>
  btn.addEventListener("click", async () => {
    await apiPost("/api/notifications/mark-read", {});
    notifications = notifications.map((n) => ({ ...n, is_read: 1 }));
    render();
  })
);

clearAllButtons.forEach((btn) =>
  btn.addEventListener("click", async () => {
    try {
      await apiDelete("/api/notifications");
      notifications = [];
      render();
      panel?.classList.add("hidden");
      unreadBadge?.classList.add("hidden");
    } catch (err) {
      showToast("Could not delete notifications");
    }
  })
);

document.addEventListener("DOMContentLoaded", () => {
  loadNotifications();
  setInterval(loadNotifications, 20000);
});

const formatType = (type) => {
  const code = (type || "").toUpperCase();
  if (code === "PRICE_DROP") return { label: "Price drop", className: "chip-positive" };
  if (code === "LOW_TICKETS") return { label: "Low tickets", className: "chip-genre" };
  if (code === "UPCOMING_SHOW_REMINDER") return { label: "Reminder", className: "chip-genre" };
  return type ? { label: type, className: "chip-muted" } : null;
};

const formatSince = (dateStr) => {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = Math.max(0, now - date.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

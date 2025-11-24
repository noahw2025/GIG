import { apiDelete, apiGet, apiPost, showToast } from "./api.js";

const bellBtn = document.getElementById("bellBtn");
const panel = document.getElementById("notificationPanel");
const listEl = document.getElementById("notificationList");
const unreadBadge = document.getElementById("unreadBadge");
const markAll = document.getElementById("markAllRead");
const clearAll = document.getElementById("clearAllNotif");

let notifications = [];

const render = () => {
  const unread = notifications.filter((n) => !n.is_read).length;
  unreadBadge.textContent = unread;
  unreadBadge.classList.toggle("hidden", unread === 0);
  if (!notifications.length) {
    listEl.innerHTML = `<div class="notification-card muted">No notifications yet.</div>`;
    return;
  }
  listEl.innerHTML = notifications
    .map(
      (n) => `<div class="notification-card ${n.is_read ? "muted" : ""}">
      <div class="row">
        <strong>${n.title}</strong>
        <small>${new Date(n.created_at).toLocaleString()}</small>
      </div>
      <div>${n.message}</div>
    </div>`
    )
    .join("");
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

markAll?.addEventListener("click", async () => {
  await apiPost("/api/notifications/mark-read", {});
  notifications = notifications.map((n) => ({ ...n, is_read: 1 }));
  render();
});

clearAll?.addEventListener("click", async () => {
  try {
    await apiDelete("/api/notifications");
    notifications = [];
    render();
    panel.classList.add("hidden");
    unreadBadge.classList.add("hidden");
  } catch (err) {
    showToast("Could not delete notifications");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  loadNotifications();
  setInterval(loadNotifications, 20000);
});

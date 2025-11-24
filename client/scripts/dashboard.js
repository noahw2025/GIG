import { apiGet, clearAuth, requireAuth, setAuth, showToast } from "./api.js";

const tabButtons = document.querySelectorAll(".tab-btn");
const panels = document.querySelectorAll(".tab-panel");
const logoutBtn = document.getElementById("logoutBtn");
const userEmailEl = document.getElementById("userEmail");

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

loadSelf();

import { apiPost, setAuth, getToken, requireAuth, showToast } from "./api.js";

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

if (getToken() && window.location.pathname.endsWith("/index.html")) {
  window.location.href = "./dashboard.html";
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(loginForm);
    try {
      const res = await apiPost("/api/auth/login", Object.fromEntries(form.entries()));
      setAuth(res.token, res.user);
      window.location.href = "./dashboard.html";
    } catch (err) {
      showToast(err.message);
    }
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = new FormData(signupForm);
    try {
      const res = await apiPost("/api/auth/signup", Object.fromEntries(form.entries()));
      setAuth(res.token, res.user);
      window.location.href = "./dashboard.html";
    } catch (err) {
      showToast(err.message);
    }
  });
}

if (window.location.pathname.endsWith("/dashboard.html")) {
  requireAuth();
}

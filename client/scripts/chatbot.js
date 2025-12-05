import { apiPost, showToast } from "./api.js";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

let lastArtist = null;
let lastCity = null;

const sanitizeHtml = (html) => {
  const allowed = new Set(["A", "BR", "UL", "OL", "LI", "STRONG", "EM", "B", "I"]);
  const temp = document.createElement("div");
  temp.innerHTML = html || "";
  const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT, null);
  const remove = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!allowed.has(node.tagName)) {
      remove.push(node);
      continue;
    }
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  }
  remove.forEach((n) => n.replaceWith(...Array.from(n.childNodes)));
  return temp.innerHTML;
};

const addBubble = (text, role, opts = {}) => {
  const div = document.createElement("div");
  div.className = `chat-bubble ${role}`;
  if (opts.html) {
    div.innerHTML = sanitizeHtml(opts.html);
  } else {
    div.textContent = text;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

chatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  addBubble(message, "user");
  chatInput.value = "";
  try {
    const res = await apiPost("/api/chatbot", { message, lastArtist, lastCity });
    if (res.events?.length) {
      const first = res.events[0];
      lastArtist = first.artist || first.title || first.name || lastArtist;
      lastCity = first.location || first.city || lastCity;
    } else {
      const lower = message.toLowerCase();
      if (lower.includes("concert")) {
        const parts = lower.split("concert")[0].trim();
        if (parts) lastArtist = parts;
      }
    }
    // Build safe HTML from events to avoid undefined labels, and prepend reply text.
    let html = "";
    if (res.reply) {
      html += `<div>${sanitizeHtml(res.reply)}</div>`;
    }
    if (res.events && res.events.length) {
      const safe = (v, fb = "Concert") => {
        if (!v) return fb;
        const s = String(v).trim();
        if (!s || s.toLowerCase() === "undefined" || s.toLowerCase() === "null") return fb;
        return s;
      };
      const items = res.events
        .map((ev) => {
          const title = safe(ev.name || ev.title || ev.artist, "Concert");
          const venue = safe(ev.venue, "Venue TBA");
          const city = safe(ev.city, "");
          const state = safe(ev.state, "");
          const date = safe(ev.date, "TBD");
          const link = ev.url ? `<a href="${ev.url}" target="_blank" rel="noopener">tickets</a>` : "tickets";
          const loc = [venue, city || state ? `${city}${state ? `, ${state}` : ""}` : ""].filter(Boolean).join(" - ");
          return `<li><strong>${title}</strong> — ${loc} on ${date} (${link})</li>`;
        })
        .join("");
      html += `<ul>${items}</ul>`;
    }
    addBubble(res.reply || "Here are some options:", "bot", { html });
  } catch (err) {
    console.error("Chat error", err);
    addBubble("I couldn't find shows for that. Try another artist or city.", "bot");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  addBubble("Hey! Ask me for shows in your city or hype ideas.", "bot");
});

import { apiPost, showToast } from "./api.js";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");

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
    const res = await apiPost("/api/chatbot", { message });
    addBubble(res.reply, "bot", { html: res.html });
  } catch (err) {
    console.error("Chat error", err);
    addBubble("I couldn't find shows for that. Try another artist or city.", "bot");
  }
});

document.addEventListener("DOMContentLoaded", () => {
  addBubble("Hey! Ask me for shows in your city or hype ideas.", "bot");
});

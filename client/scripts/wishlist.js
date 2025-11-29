import { apiDelete, apiGet, apiPost, formatDate, showToast } from "./api.js";

const listEl = document.getElementById("wishlistList");

let wishlist = [];

export const loadWishlist = async () => {
  if (!listEl) return;
  try {
    const res = await apiGet("/api/wishlist");
    wishlist = res.wishlist || [];
    render();
  } catch (err) {
    listEl.innerHTML = `<div class="card empty">${err.message}</div>`;
  }
};

const render = () => {
  if (!wishlist.length) {
    listEl.innerHTML = `<div class="card empty">No wishlist items yet. Save shows you want to watch.</div>`;
    return;
  }
  listEl.innerHTML = wishlist
    .map((w) => {
      const price =
        w.min_price && w.max_price
          ? `$${w.min_price} - $${w.max_price}`
          : w.min_price
          ? `From $${w.min_price}`
          : w.max_price
          ? `Up to $${w.max_price}`
          : "";
      const mapLink = buildMapLink(w);
      const status = formatStatus(w.ticket_status);
      return `<div class="card wish-card" data-wish="${w.wishlist_id}" data-concert="${w.id}">
        <div class="floating-actions">
          <div class="pill">Saved ${formatDate(w.wishlisted_at)}</div>
          ${w.genre ? `<span class="chip chip-genre">${w.genre}</span>` : ""}
          ${status ? `<span class="chip ${status.className}">${status.label}</span>` : ""}
        </div>
        <h3>${w.artist}</h3>
        <p class="muted">${w.title || ""}</p>
        <div class="meta">
          <span>${w.venue || w.location || "Venue TBA"}</span>
          <span>${formatDate(w.date)}</span>
          ${price ? `<span>${price}</span>` : ""}
          ${mapLink ? `<a class="ghost small-btn" href="${mapLink}" target="_blank" rel="noopener">Map</a>` : ""}
        </div>
        <div class="actions">
          <button class="primary" data-act="favorite">Move to Favorites</button>
          <a class="ghost" href="${w.ticket_url || "#"}" target="_blank" rel="noopener">Book Tickets</a>
          <button class="ghost" data-act="share">Share</button>
          <button class="ghost" data-act="remove">Remove</button>
        </div>
      </div>`;
    })
    .join("");
};

listEl?.addEventListener("click", async (e) => {
  const card = e.target.closest(".wish-card");
  if (!card) return;
  const id = card.dataset.wish;
  const concertId = card.dataset.concert;
  const act = e.target.dataset.act;
  const item = wishlist.find((w) => String(w.wishlist_id) === String(id));
  if (!item) return;

  if (act === "remove") {
    await apiDelete(`/api/wishlist/${id}`);
    showToast("Removed from wishlist");
    loadWishlist();
  }

  if (act === "favorite") {
    try {
      await apiPost("/api/favorites", item);
      await apiDelete(`/api/wishlist/${id}`);
      showToast("Moved to favorites");
      loadWishlist();
    } catch (err) {
      showToast(err.message);
    }
  }

  if (act === "share") {
    const url = `${window.location.origin}/dashboard.html?concertId=${encodeURIComponent(item.external_id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.title || item.artist, text: "Check this show", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("Link copied!");
    } catch {
      showToast("Could not share right now.");
    }
  }
});

document.addEventListener("DOMContentLoaded", loadWishlist);

const buildMapLink = (ev) => {
  const venue = ev.venue || "";
  const loc = ev.location || "";
  const query = `${venue} ${loc}`.trim();
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const formatStatus = (status) => {
  if (!status) return null;
  const code = String(status).toLowerCase();
  if (code.includes("sold")) return { label: "Sold out", className: "chip-muted" };
  if (code.includes("limited") || code.includes("low")) return { label: "Limited", className: "chip-genre" };
  if (code.includes("available") || code.includes("onsale")) return { label: "Available", className: "chip-positive" };
  return { label: status, className: "chip-muted" };
};

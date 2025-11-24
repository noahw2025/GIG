import express from "express";
import { createFavorite, getFavoritesByUser, deleteFavorite } from "../models/favorites.js";
import { createNotification } from "../models/notifications.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/", async (req, res) => {
  try {
    const concertPayload = req.body;
    if (!concertPayload?.external_id) return res.status(400).json({ error: "Missing concert external_id" });
    const { concert, favorite } = await createFavorite(req.user.id, concertPayload);
    await createNotification({
      user_id: req.user.id,
      type: "favorite",
      title: "Added to Favorites",
      message: `You favorited ${concert.artist} at ${concert.venue || concert.location}.`,
    });
    res.json({ favorite, concert });
  } catch (err) {
    console.error("Add favorite failed:", err);
    res.status(500).json({ error: err?.message || "Could not add favorite" });
  }
});

router.get("/", async (req, res) => {
  try {
    const favorites = await getFavoritesByUser(req.user.id);
    res.json({ favorites });
  } catch (err) {
    console.error("Fetch favorites failed:", err);
    res.status(500).json({ error: err?.message || "Could not fetch favorites" });
  }
});

router.delete("/:favoriteId", async (req, res) => {
  try {
    const success = await deleteFavorite(req.params.favoriteId, req.user.id);
    if (!success) return res.status(404).json({ error: "Favorite not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete favorite failed:", err);
    res.status(500).json({ error: err?.message || "Could not delete favorite" });
  }
});

export default router;

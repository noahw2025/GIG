import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getUserById, updateProfile, getUserStats } from "../models/users.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const stats = await getUserStats(req.user.id);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, stats });
  } catch (err) {
    console.error("Fetch profile failed:", err);
    res.status(500).json({ error: err?.message || "Could not fetch profile" });
  }
});

router.put("/", async (req, res) => {
  try {
    const { full_name, city, favorite_artists, favorite_genre } = req.body;
    const updated = await updateProfile(req.user.id, { full_name, city, favorite_artists, favorite_genre });
    const { password_hash, ...safeUser } = updated;
    res.json({ user: safeUser });
  } catch (err) {
    console.error("Update profile failed:", err);
    res.status(500).json({ error: err?.message || "Could not update profile" });
  }
});

export default router;

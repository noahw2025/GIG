import express from "express";
import { upsertReview, getReviewsForConcert, getAverageRating } from "../models/reviews.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    const { concert_id, rating, comment } = req.body;
    if (!concert_id || !rating) return res.status(400).json({ error: "concert_id and rating are required" });
    const review = await upsertReview({ user_id: req.user.id, concert_id, rating, comment });
    res.json({ review });
  } catch (err) {
    console.error("Save review failed:", err);
    res.status(500).json({ error: err?.message || "Could not save review" });
  }
});

router.get("/:concertId", async (req, res) => {
  try {
    const items = await getReviewsForConcert(req.params.concertId);
    const avg = await getAverageRating(req.params.concertId);
    res.json({ reviews: items, average: avg.avgRating, count: avg.count });
  } catch (err) {
    console.error("Fetch reviews failed:", err);
    res.status(500).json({ error: err?.message || "Could not fetch reviews" });
  }
});

export default router;

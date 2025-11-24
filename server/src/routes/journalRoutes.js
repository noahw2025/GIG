import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import {
  createJournalEntry,
  getJournalEntriesByUser,
  getJournalCountByUser,
  getArtistEntryCount,
  deleteJournalEntry,
  updateJournalEntry,
} from "../models/journal.js";
import { getConcertById } from "../models/concerts.js";
import { createNotification } from "../models/notifications.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const entries = await getJournalEntriesByUser(req.user.id);
    res.json({ entries });
  } catch (err) {
    console.error("Fetch journal failed:", err);
    res.status(500).json({ error: err?.message || "Could not fetch journal entries" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { concert_id, entry_text, mood, attended_at } = req.body;
    if (!concert_id || !entry_text) return res.status(400).json({ error: "concert_id and entry_text are required" });
    const concert = await getConcertById(concert_id);
    if (!concert) return res.status(404).json({ error: "Concert not found" });
    const totalCount = await getJournalCountByUser(req.user.id);
    const artistCount = await getArtistEntryCount(req.user.id, concert.artist);
    let badge_type = "Concert Explorer Badge";
    if (totalCount === 0) {
      badge_type = "First Gig Badge";
    } else if (artistCount >= 2) {
      badge_type = "Super Fan Badge";
    }
    const entry = await createJournalEntry({
      user_id: req.user.id,
      concert_id,
      entry_text,
      mood,
      badge_type,
      attended_at,
    });
    await createNotification({
      user_id: req.user.id,
      type: "journal",
      title: badge_type,
      message: `You logged a concert with ${concert.artist} and earned ${badge_type}.`,
    });
    res.json({ entry });
  } catch (err) {
    console.error("Save journal failed:", err);
    res.status(500).json({ error: err?.message || "Could not save journal entry" });
  }
});

router.put("/:entryId", async (req, res) => {
  try {
    const { entry_text, mood, attended_at } = req.body;
    const updated = await updateJournalEntry({
      id: req.params.entryId,
      user_id: req.user.id,
      entry_text,
      mood,
      attended_at,
    });
    if (!updated) return res.status(404).json({ error: "Entry not found" });
    res.json({ entry: updated });
  } catch (err) {
    console.error("Update journal failed:", err);
    res.status(500).json({ error: err?.message || "Could not update journal entry" });
  }
});

router.delete("/:entryId", async (req, res) => {
  try {
    const success = await deleteJournalEntry(req.params.entryId, req.user.id);
    if (!success) return res.status(404).json({ error: "Entry not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete journal failed:", err);
    res.status(500).json({ error: err?.message || "Could not delete journal entry" });
  }
});

export default router;

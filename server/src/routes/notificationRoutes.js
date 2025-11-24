import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { getNotificationsByUser, markNotificationsRead, deleteNotifications } from "../models/notifications.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const notifications = await getNotificationsByUser(req.user.id);
    res.json({ notifications });
  } catch (err) {
    console.error("Fetch notifications failed:", err);
    res.status(500).json({ error: err?.message || "Could not fetch notifications" });
  }
});

router.post("/mark-read", async (req, res) => {
  try {
    const { ids } = req.body || {};
    await markNotificationsRead(req.user.id, ids);
    res.json({ success: true });
  } catch (err) {
    console.error("Mark notifications failed:", err);
    res.status(500).json({ error: err?.message || "Could not mark notifications" });
  }
});

router.delete("/", async (req, res) => {
  try {
    const { ids } = req.body || {};
    await deleteNotifications(req.user.id, ids);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete notifications failed:", err);
    res.status(500).json({ error: err?.message || "Could not delete notifications" });
  }
});

export default router;

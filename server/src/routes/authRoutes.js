import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createUser, getUserByEmail, getUserById } from "../models/users.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { JWT_SECRET } from "../config/config.js";

const router = express.Router();

const buildToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
};

router.post("/signup", async (req, res) => {
  try {
    const { full_name, email, password, city, favorite_artists, favorite_genre } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const existing = await getUserByEmail(email);
    if (existing) return res.status(400).json({ error: "Email already in use" });
    const password_hash = await bcrypt.hash(password, 10);
    const user = await createUser({ full_name, email, password_hash, city, favorite_artists, favorite_genre });
    const token = buildToken(user);
    return res.json({ token, user });
  } catch (err) {
    console.error("Signup failed:", err);
    res.status(500).json({ error: err?.message || "Signup failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await getUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });
    const token = buildToken(user);
    const { password_hash, ...userSafe } = user;
    res.json({ token, user: userSafe });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: err?.message || "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password_hash, ...userSafe } = user;
    res.json({ user: userSafe });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch user" });
  }
});

export default router;

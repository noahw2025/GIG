import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { PORT } from "./config/config.js";
import authRoutes from "./routes/authRoutes.js";
import concertRoutes from "./routes/concertRoutes.js";
import favoriteRoutes from "./routes/favoriteRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import journalRoutes from "./routes/journalRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import chatbotRoutes from "./routes/chatbotRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

const clientPath = path.join(__dirname, "..", "..", "client");
app.use(express.static(clientPath));

app.use("/api/auth", authRoutes);
app.use("/api/concerts", concertRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chatbot", chatbotRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(clientPath, "index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(clientPath, "dashboard.html"));
});

app.listen(PORT, () => {
  console.log(`TrackMyGig server running on http://localhost:${PORT}`);
});

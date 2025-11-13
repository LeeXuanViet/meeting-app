import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import authRoutes from "./routes/auth.js";
import meetingRoutes from "./routes/meeting.js";
import userRoutes from "./routes/user.js";
import documentRoutes from "./routes/document.js";
import { initializeSocket } from "./socket/socketHandler.js";

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO with CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "https://bkmeeting.soict.io",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Initialize socket handlers
initializeSocket(io);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/documents", documentRoutes);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));

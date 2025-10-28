import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  phone: { type: String },
  username: { type: String, unique: true, sparse: true }, // Optional for OAuth users
  password: { type: String }, // Optional for OAuth users
  googleId: { type: String, unique: true, sparse: true }, // For Google OAuth
  role: { type: String, enum: ["admin", "user"], default: "user" },
  approved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

export default mongoose.model("User", userSchema)

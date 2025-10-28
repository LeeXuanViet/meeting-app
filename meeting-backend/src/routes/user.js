import express from "express"
import User from "../models/User.js"
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js"

const router = express.Router()

// Get pending users
router.get("/pending", verifyToken, isAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find({ approved: false }, "email fullName phone role createdAt")
    res.json(pendingUsers)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get all users stats
router.get("/stats", verifyToken, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments()
    const pendingUsers = await User.countDocuments({ approved: false })
    const approvedUsers = await User.countDocuments({ approved: true })
    res.json({ totalUsers, pendingUsers, approvedUsers })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Approve user
router.patch("/approve/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: "User not found" })

    user.approved = true
    await user.save()
    res.json({ message: `User ${user.email} đã được duyệt.` })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Delete user
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id)
    res.json({ message: "User đã bị xóa." })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

export default router

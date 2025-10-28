import express from "express"
import Meeting from "../models/Meeting.js"
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js"

const router = express.Router()

// Create meeting (admin only)
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { title, description, startTime, endTime } = req.body

    const meeting = new Meeting({
      title,
      description,
      startTime,
      endTime,
      createdBy: req.user.id,
      participants: [req.user.id],
    })

    await meeting.save()
    res.json({ message: "Cuộc họp được tạo thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get all meetings
router.get("/", verifyToken, async (req, res) => {
  try {
    const meetings = await Meeting.find()
      .populate("createdBy", "email fullName")
      .populate("participants", "email fullName")
      .sort({ createdAt: -1 })

    res.json(meetings)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Get meeting by ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate("createdBy", "email fullName")
      .populate("participants", "email fullName")

    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    res.json(meeting)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Join meeting
router.post("/:id/join", verifyToken, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)

    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    if (!meeting.participants.includes(req.user.id)) {
      meeting.participants.push(req.user.id)
      await meeting.save()
    }

    res.json({ message: "Tham gia cuộc họp thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Update meeting (admin only)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { title, description, startTime, endTime, status } = req.body

    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { title, description, startTime, endTime, status, updatedAt: Date.now() },
      { new: true },
    )

    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    res.json({ message: "Cập nhật cuộc họp thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Delete meeting (admin only)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const meeting = await Meeting.findByIdAndDelete(req.params.id)

    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    res.json({ message: "Xóa cuộc họp thành công" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

export default router

import express from "express"
import Meeting from "../models/Meeting.js"
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js"
import crypto from "crypto"

const router = express.Router()

// Hàm tạo ngẫu nhiên mã phòng họp (roomId) duy nhất
const generateRoomId = () => {
  return crypto.randomBytes(8).toString("hex")
}

// API: Tạo cuộc họp (chỉ Admin)
router.post("/", verifyToken, isAdmin, async (req, res) => {
  try {
    const { title, description, startTime, endTime } = req.body

    // Tạo mã phòng (roomId)
    let roomId = generateRoomId()
    let existingMeeting = await Meeting.findOne({ roomId })

    // Nếu mã phòng bị trùng thì tạo lại cho đến khi unique
    while (existingMeeting) {
      roomId = generateRoomId()
      existingMeeting = await Meeting.findOne({ roomId })
    }

    // Lưu thông tin cuộc họp vào MongoDB
    const meeting = new Meeting({
      title,
      description,
      startTime,
      endTime,
      roomId,
      createdBy: req.user.id,       // id admin tạo cuộc họp
      participants: [req.user.id],  // người tạo tự động tham gia
    })

    await meeting.save()
    res.json({ message: "Cuộc họp được tạo thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Lấy danh sách tất cả cuộc họp
router.get("/", verifyToken, async (req, res) => {
  try {
    const meetings = await Meeting.find()
      .populate("createdBy", "email fullName")      // Lấy thêm thông tin người tạo
      .populate("participants", "email fullName")   // Lấy thêm thông tin người tham gia
      .sort({ createdAt: -1 })                      // Sắp xếp theo thời gian mới nhất

    res.json(meetings)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Lấy thông tin chi tiết cuộc họp theo ID
router.get("/:id", verifyToken, async (req, res) => {
  try {
    let meeting = await Meeting.findById(req.params.id)
      .populate("createdBy", "email fullName")
      .populate("participants", "email fullName")

    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    // Với các bản ghi cũ chưa có roomId, tự động tạo roomId và lưu lại
    if (!meeting.roomId) {
      let roomId = generateRoomId()
      let existingMeeting = await Meeting.findOne({ roomId })
      while (existingMeeting) {
        roomId = generateRoomId()
        existingMeeting = await Meeting.findOne({ roomId })
      }

      meeting.roomId = roomId
      await meeting.save()
    }

    res.json(meeting)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Lấy thông tin cuộc họp theo roomId
router.get("/room/:roomId", verifyToken, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId })
      .populate("createdBy", "email fullName")
      .populate("participants", "email fullName")

    if (!meeting) return res.status(404).json({ message: "Phòng họp không tồn tại" })
    res.json(meeting)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Tham gia cuộc họp bằng ID
router.post("/:id/join", verifyToken, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    // Nếu người dùng chưa có trong danh sách, thêm vào
    if (!meeting.participants.some((p) => p?.toString() === req.user.id)) {
      meeting.participants.push(req.user.id)
      await meeting.save()
    }

    res.json({ message: "Tham gia cuộc họp thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Tham gia cuộc họp bằng roomId
router.post("/room/:roomId/join", verifyToken, async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ roomId: req.params.roomId })
    if (!meeting) return res.status(404).json({ message: "Phòng họp không tồn tại" })

    if (!meeting.participants.some((p) => p?.toString() === req.user.id)) {
      meeting.participants.push(req.user.id)
      await meeting.save()
    }

    res.json({ message: "Tham gia cuộc họp thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Cập nhật thông tin cuộc họp (Admin)
router.put("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const { title, description, startTime, endTime, status } = req.body

    const meeting = await Meeting.findByIdAndUpdate(
      req.params.id,
      { title, description, startTime, endTime, status, updatedAt: Date.now() },
      { new: true } // trả về bản ghi sau khi update
    )

    if (!meeting) return res.status(404).json({ message: "Cuộc họp không tồn tại" })

    res.json({ message: "Cập nhật cuộc họp thành công", meeting })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// API: Xoá cuộc họp (Admin)
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

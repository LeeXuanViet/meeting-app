import express from "express"
import User from "../models/User.js"
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js"

const router = express.Router()  

// Lấy danh sách người dùng đang chờ duyệt - admin (GET /users/pending)
router.get("/pending", verifyToken, isAdmin, async (req, res) => {
  try {
    const pendingUsers = await User.find(
      { approved: false },
      "email fullName phone role createdAt"
    )
    // Gửi danh sách người dùng chờ duyệt về client
    res.json(pendingUsers)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Thống kê tổng số người dùng (GET /users/stats)
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

// Duyệt tài khoản người dùng (PATCH /users/approve/:id)
router.patch("/approve/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    // Tìm user theo id được truyền trong URL
    const user = await User.findById(req.params.id)
    if (!user) return res.status(404).json({ message: "User not found" })

    // Cập nhật trạng thái approved = true
    user.approved = true
    await user.save()

    // Gửi phản hồi về client
    res.json({ message: `User ${user.email} đã được duyệt.` })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Xóa tài khoản người dùng (DELETE /users/:id)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    // Xóa user theo id được truyền trong URL
    await User.findByIdAndDelete(req.params.id)

    res.json({ message: "User đã bị xóa." })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

export default router

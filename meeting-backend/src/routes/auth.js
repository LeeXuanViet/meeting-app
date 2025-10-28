import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import User from "../models/User.js"

dotenv.config()
const router = express.Router()

// Register with email, fullName, phone
router.post("/register", async (req, res) => {
  try {
    const { email, fullName, phone, password } = req.body

    // Check if user already exists
    const existing = await User.findOne({ $or: [{ email }, { username: email }] })
    if (existing) return res.status(400).json({ message: "Email đã được đăng ký" })

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create new user
    const user = new User({
      email,
      fullName,
      phone,
      username: email, // Use email as username
      password: hashedPassword,
      role: "user",
      approved: false,
    })

    await user.save()
    res.json({
      message: "Đăng ký thành công. Tài khoản sẽ hoạt động sau khi admin duyệt.",
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// Login with email
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ message: "Email không tồn tại" })

    if (!user.approved) {
      return res.status(403).json({ message: "Tài khoản của bạn chưa được admin duyệt." })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ message: "Mật khẩu không chính xác" })

    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    })

    res.json({ token, role: user.role, user: { id: user._id, email: user.email, fullName: user.fullName } })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post("/google-callback", async (req, res) => {
  try {
    const { googleId, email, fullName } = req.body

    let user = await User.findOne({ googleId })

    if (!user) {
      // Create new user from Google
      user = new User({
        googleId,
        email,
        fullName,
        role: "user",
        approved: false, // Still needs admin approval
      })
      await user.save()
    }

    if (!user.approved) {
      return res.status(403).json({ message: "Tài khoản của bạn chưa được admin duyệt." })
    }

    const token = jwt.sign({ id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    })

    res.json({ token, role: user.role, user: { id: user._id, email: user.email, fullName: user.fullName } })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

export default router

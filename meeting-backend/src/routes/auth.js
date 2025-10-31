import express from "express"
import bcrypt from "bcryptjs"           // Dùng để mã hóa mật khẩu
import jwt from "jsonwebtoken"          // Dùng để tạo token đăng nhập (JWT)
import dotenv from "dotenv"             // Dùng để đọc biến môi trường (.env)
import User from "../models/User.js"    // Import model User để thao tác với MongoDB

dotenv.config()                         // Nạp biến môi trường từ file .env
const router = express.Router()         // Tạo router Express riêng cho các route /auth

// Register
router.post("/register", async (req, res) => {
  try {
    const { email, fullName, phone, password } = req.body   

    // Kiểm tra xem người dùng đã tồn tại chưa (theo email hoặc username)
    const existing = await User.findOne({ $or: [{ email }, { username: email }] })
    if (existing) return res.status(400).json({ message: "Email đã được đăng ký" })

    // Mã hóa mật khẩu bằng bcrypt trước khi lưu
    const hashedPassword = await bcrypt.hash(password, 10)

    // Tạo user mới (chưa được admin duyệt)
    const user = new User({
      email,
      fullName,
      phone,
      username: email,          // Dùng email làm username
      password: hashedPassword, // Lưu mật khẩu đã mã hóa
      role: "user",             // Mặc định là người dùng thường
      approved: false,          // Cần admin duyệt mới được đăng nhập
    })

    // Lưu người dùng vào cơ sở dữ liệu MongoDB
    await user.save()

    // Phản hồi về cho client
    res.json({
      message: "Đăng ký thành công. Tài khoản sẽ hoạt động sau khi admin duyệt.",
    })
  } catch (error) {
    // Nếu có lỗi, trả về lỗi 500
    res.status(500).json({ message: error.message })
  }
})

// Đăng nhập tài khoản (Login)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body   // Lấy email và mật khẩu từ client gửi lên

    // Tìm người dùng theo email
    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ message: "Email không tồn tại" })

    // Kiểm tra xem tài khoản đã được admin duyệt chưa
    if (!user.approved) {
      return res.status(403).json({ message: "Tài khoản của bạn chưa được admin duyệt." })
    }

    // Kiểm tra mật khẩu có đúng không (so sánh với mật khẩu đã mã hóa)
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(400).json({ message: "Mật khẩu không chính xác" })

    // Tạo JWT token chứa thông tin người dùng (id, role, email)
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }   
    )

    // Trả token và thông tin cơ bản của user về cho client
    res.json({
      token,
      role: user.role,
      user: { id: user._id, email: user.email, fullName: user.fullName },
    })
  } catch (error) {
    // Nếu có lỗi, trả về lỗi 500
    res.status(500).json({ message: error.message })
  }
})

// Đăng nhập bằng tài khoản Google (Google OAuth)
router.post("/google-callback", async (req, res) => {
  try {
    const { googleId, email, fullName } = req.body   // Nhận dữ liệu từ client (sau khi Google xác thực)

    // Tìm người dùng theo googleId
    let user = await User.findOne({ googleId })

    // Nếu chưa có, tạo người dùng mới từ thông tin Google
    if (!user) {
      user = new User({
        googleId,
        email,
        fullName,
        role: "user",       // Mặc định là user
        approved: false,    // Cần admin duyệt trước khi sử dụng
      })
      await user.save()
    }

    // Nếu tài khoản chưa được admin duyệt thì chặn lại
    if (!user.approved) {
      return res.status(403).json({ message: "Tài khoản của bạn chưa được admin duyệt." })
    }

    // Nếu đã được duyệt, tạo token đăng nhập
    const token = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    )

    // Gửi token và thông tin người dùng về client
    res.json({
      token,
      role: user.role,
      user: { id: user._id, email: user.email, fullName: user.fullName },
    })
  } catch (error) {
    // Nếu có lỗi, trả về lỗi 500
    res.status(500).json({ message: error.message })
  }
})

// Xuất router để có thể dùng trong server.js
export default router

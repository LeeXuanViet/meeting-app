import jwt from "jsonwebtoken"
import dotenv from "dotenv"

dotenv.config()

export const verifyToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) {
      return res.status(401).json({ message: "Token không được cung cấp" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: "Token không hợp lệ hoặc đã hết hạn" })
  }
}

export const isAdmin = (req, res, next) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Chỉ admin mới có quyền truy cập" })
    }
    next()
  } catch (error) {
    res.status(403).json({ message: "Lỗi kiểm tra quyền" })
  }
}

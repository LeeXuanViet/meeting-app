import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import dotenv from "dotenv"
import User from "../src/models/User.js"

dotenv.config()

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect("mongodb://root:example123@bkmeeting.soict.io:27017/meetingDB?authSource=admin")
    console.log("✓ Kết nối MongoDB thành công")

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: "admin" })
    if (existingAdmin) {
      console.log("✓ Admin đã tồn tại:", existingAdmin.email)
      await mongoose.connection.close()
      return
    }

    const hashedPassword = await bcrypt.hash("admin123", 10)
    const adminUser = new User({
      email: "admin@meeting.com",
      fullName: "Admin",
      phone: "+84123456789",
      username: "admin",
      password: hashedPassword,
      role: "admin",
      approved: true, // Admin is automatically approved
    })

    await adminUser.save()
    console.log("✓ Tài khoản admin được tạo thành công!")
    console.log("  Email: admin@meeting.com")
    console.log("  Mật khẩu: admin123")
    console.log("  (Vui lòng đổi mật khẩu sau khi đăng nhập)")

    await mongoose.connection.close()
  } catch (error) {
    console.error("Lỗi:", error.message)
    process.exit(1)
  }
}

seedAdmin()

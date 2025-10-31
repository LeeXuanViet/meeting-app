"use client"

import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { authAPI } from "../api/auth"
import { GoogleLogin } from "@react-oauth/google"
import "../styles/AuthPages.css"

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    phone: "",
    password: "",
    confirmPassword: "",
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (formData.password !== formData.confirmPassword) {
      setError("Mật khẩu không khớp")
      return
    }

    setLoading(true)
    try {
      const response = await authAPI.register({
        email: formData.email,
        fullName: formData.fullName,
        phone: formData.phone,
        password: formData.password,
      })

      setError("")
      alert(response.data.message)
      navigate("/login")
    } catch (err) {
      setError(err.response?.data?.message || "Đăng ký thất bại")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      // Decode JWT token from Google
      const token = credentialResponse.credential
      const base64Url = token.split(".")[1]
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join(""),
      )
      const googleData = JSON.parse(jsonPayload)

      const response = await authAPI.googleCallback({
        googleId: googleData.sub,
        email: googleData.email,
        fullName: googleData.name,
      })

      login(response.data.token, response.data.user)
      navigate("/dashboard")
    } catch (err) {
      setError(err.response?.data?.message || "Đăng nhập Google thất bại")
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Đăng ký ngay!</h1>
        <p className="auth-subtitle">Nhập các thông tin dưới đây để đăng ký tài khoản.</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="your.email@example.com"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Họ và tên</label>
            <input
              type="text"
              name="fullName"
              placeholder="Nguyễn Văn A"
              value={formData.fullName}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Số điện thoại</label>
            <input type="tel" name="phone" placeholder="+1234567890" value={formData.phone} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Xác nhận mật khẩu</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Đang xử lý..." : "Tạo tài khoản"}
          </button>
        </form>

        <div className="divider">
          <span>Hoặc tiếp tục với</span>
        </div>

        <div className="google-login">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Đăng nhập Google thất bại")}
            text="signup_with"
            locale="vi_VN"
          />
        </div>

        <p className="auth-footer">
          Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link>
        </p>
      </div>
    </div>
  )
}

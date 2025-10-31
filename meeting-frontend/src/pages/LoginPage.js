"use client"

import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { authAPI } from "../api/auth"
import { GoogleLogin } from "@react-oauth/google"
import "../styles/AuthPages.css"

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: "",
    password: "",
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
    setLoading(true)

    try {
      const response = await authAPI.login({
        email: formData.email,
        password: formData.password,
      })

      const userData = {
        ...response.data.user,
        role: response.data.role,
      }

      login(response.data.token, userData)

      if (response.data.role === "admin") {
        navigate("/admin")
      } else {
        navigate("/dashboard")
      }
    } catch (err) {
      setError(err.response?.data?.message || "Đăng nhập thất bại")
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
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

      const userData = {
        ...response.data.user,
        role: response.data.role,
      }

      login(response.data.token, userData)

      if (response.data.role === "admin") {
        navigate("/admin")
      } else {
        navigate("/dashboard")
      }
    } catch (err) {
      setError(err.response?.data?.message || "Đăng nhập Google thất bại")
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Chào mừng bạn trở lại!</h1>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="Nhập email của bạn"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Mật khẩu</label>
            <input
              type="password"
              name="password"
              placeholder="Nhập mật khẩu của bạn"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Đang xử lý..." : "Đăng nhập"}
          </button>
        </form>

        <p className="forgot-password">
          <Link to="/forgot-password">Quên mật khẩu?</Link>
        </p>

        <div className="divider">
          <span>Hoặc tiếp tục với</span>
        </div>

        <div className="google-login">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Đăng nhập Google thất bại")}
            text="signin_with"
            locale="vi_VN"
          />
        </div>

        <p className="auth-footer">
          Quên mật khẩu? <Link to="/register">Đăng ký ngay</Link>
        </p>
      </div>
    </div>
  )
}

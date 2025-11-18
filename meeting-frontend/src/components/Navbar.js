"use client"

import { useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import "../styles/Navbar.css"

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  const handleAdminClick = () => {
    navigate("/admin")
  }

  const handleDashboardClick = () => {
    navigate("/dashboard")
  }

  const isAdminPage = location.pathname === "/admin"
  const isDashboardPage = location.pathname === "/dashboard"

  const getInitials = () => {
    const source = user?.fullName || user?.email || ""
    if (!source) return "ME"
    const parts = source.trim().split(" ").filter(Boolean)
    if (parts.length === 0) return source.slice(0, 2).toUpperCase()
    const initials = parts.map((part) => part[0]).join("")
    return initials.slice(0, 2).toUpperCase()
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button className="navbar-brand" onClick={handleDashboardClick} aria-label="Quay lại dashboard">
          <div className="brand-icon">✦</div>
          <div className="brand-copy">
            <span className="brand-title">xMeet</span>
            <span className="brand-tagline">Smart meeting workspace</span>
          </div>
        </button>

        <div className="navbar-menu">
          {/* Navigation buttons for admin */}
          {user?.role === "admin" && (
            <div className="navbar-nav">
              <button
                onClick={handleDashboardClick}
                className={`nav-btn ${isDashboardPage ? "active" : ""}`}
                title="Dashboard"
              >
                <span className="nav-icon">📊</span>
                <span className="nav-text">Dashboard</span>
              </button>
              <button
                onClick={handleAdminClick}
                className={`nav-btn ${isAdminPage ? "active" : ""}`}
                title="Admin Panel"
              >
                <span className="nav-icon">⚙️</span>
                <span className="nav-text">Admin</span>
              </button>
            </div>
          )}

          <div className="navbar-user">
            <div className="user-info">
              <span className="user-name">{user?.fullName || user?.email}</span>
              <span className="user-role">{user?.role === "admin" ? "Quản trị viên" : "Thành viên"}</span>
            </div>
            <div className="user-avatar">{getInitials()}</div>
          </div>

          <button onClick={handleLogout} className="btn-logout">
            Đăng xuất
          </button>
        </div>
      </div>
    </nav>
  )
}

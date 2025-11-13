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

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <h2>Meeting App</h2>
        </div>

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

          <span className="user-info">
            {user?.fullName || user?.email}
            {user?.role === "admin" && <span className="admin-badge">Admin</span>}
          </span>

          <button onClick={handleLogout} className="btn-logout">
            Đăng xuất
          </button>
        </div>
      </div>
    </nav>
  )
}

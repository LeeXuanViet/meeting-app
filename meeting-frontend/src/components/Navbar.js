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

  const isAdminPage = location.pathname === "/admin"

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-brand">
          <h2>Meeting App</h2>
        </div>

        <div className="navbar-menu">
          <span className="user-info">
            {user?.fullName || user?.email}
            {user?.role === "admin" && <span className="admin-badge">Admin</span>}
          </span>

          {user?.role === "admin" && !isAdminPage && (
            <button onClick={handleAdminClick} className="btn-admin">
              Admin
            </button>
          )}

          <button onClick={handleLogout} className="btn-logout">
            Đăng xuất
          </button>
        </div>
      </div>
    </nav>
  )
}

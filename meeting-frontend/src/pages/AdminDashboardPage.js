"use client"

import { useState, useEffect } from "react"
import { userAPI } from "../api/auth"
import Navbar from "../components/Navbar"
import "../styles/AdminDashboard.css"

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ totalUsers: 0, pendingUsers: 0, approvedUsers: 0 })
  const [pendingUsers, setPendingUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([userAPI.getStats(), userAPI.getPendingUsers()])

      setStats(statsRes.data)
      setPendingUsers(usersRes.data)
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (userId) => {
    setActionLoading((prev) => ({ ...prev, [userId]: true }))
    try {
      await userAPI.approveUser(userId)
      setPendingUsers((prev) => prev.filter((u) => u._id !== userId))
      setStats((prev) => ({
        ...prev,
        pendingUsers: prev.pendingUsers - 1,
        approvedUsers: prev.approvedUsers + 1,
      }))
    } catch (error) {
      console.error("Error approving user:", error)
    } finally {
      setActionLoading((prev) => ({ ...prev, [userId]: false }))
    }
  }

  const handleDelete = async (userId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa người dùng này?")) {
      setActionLoading((prev) => ({ ...prev, [userId]: true }))
      try {
        await userAPI.deleteUser(userId)
        setPendingUsers((prev) => prev.filter((u) => u._id !== userId))
        setStats((prev) => ({
          ...prev,
          totalUsers: prev.totalUsers - 1,
          pendingUsers: prev.pendingUsers - 1,
        }))
      } catch (error) {
        console.error("Error deleting user:", error)
      } finally {
        setActionLoading((prev) => ({ ...prev, [userId]: false }))
      }
    }
  }

  return (
    <div className="admin-dashboard">
      <Navbar />

      <div className="admin-container">
        <div className="admin-header">
          <h1>Bảng điều khiển Admin</h1>
          <p>Quản lý người dùng và duyệt đăng ký</p>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon total">👥</div>
            <div className="stat-content">
              <p className="stat-label">Tổng người dùng</p>
              <h3 className="stat-value">{stats.totalUsers}</h3>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon pending">⏳</div>
            <div className="stat-content">
              <p className="stat-label">Chờ duyệt</p>
              <h3 className="stat-value">{stats.pendingUsers}</h3>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon approved">✓</div>
            <div className="stat-content">
              <p className="stat-label">Đã duyệt</p>
              <h3 className="stat-value">{stats.approvedUsers}</h3>
            </div>
          </div>
        </div>

        {/* Pending Users Table */}
        <div className="pending-users-section">
          <h2>Người dùng chờ duyệt</h2>

          {loading ? (
            <div className="loading">Đang tải...</div>
          ) : pendingUsers.length === 0 ? (
            <div className="empty-state">
              <p>Không có người dùng nào chờ duyệt</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Họ tên</th>
                    <th>Số điện thoại</th>
                    <th>Ngày đăng ký</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.map((pendingUser) => (
                    <tr key={pendingUser._id}>
                      <td className="email-cell">{pendingUser.email}</td>
                      <td>{pendingUser.fullName}</td>
                      <td>{pendingUser.phone || "-"}</td>
                      <td>{new Date(pendingUser.createdAt).toLocaleDateString("vi-VN")}</td>
                      <td className="action-cell">
                        <button
                          className="btn-approve"
                          onClick={() => handleApprove(pendingUser._id)}
                          disabled={actionLoading[pendingUser._id]}
                        >
                          {actionLoading[pendingUser._id] ? "..." : "✓ Duyệt"}
                        </button>
                        <button
                          className="btn-delete"
                          onClick={() => handleDelete(pendingUser._id)}
                          disabled={actionLoading[pendingUser._id]}
                        >
                          {actionLoading[pendingUser._id] ? "..." : "✕ Xóa"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

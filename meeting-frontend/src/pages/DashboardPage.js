"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { meetingAPI } from "../api/auth"
import Navbar from "../components/Navbar"
import "../styles/Dashboard.css"

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    description: "",
  })

  useEffect(() => {
    fetchMeetings()
  }, [])

  const fetchMeetings = async () => {
    try {
      const response = await meetingAPI.getMeetings()
      setMeetings(response.data)
    } catch (error) {
      console.error("Error fetching meetings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateMeeting = async (e) => {
    e.preventDefault()
    try {
      await meetingAPI.createMeeting(formData)
      setFormData({ title: "", description: "" })
      setShowCreateForm(false)
      fetchMeetings()
    } catch (error) {
      console.error("Error creating meeting:", error)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className="dashboard">
      <Navbar />

      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>Chào mừng, {user?.fullName || user?.email}!</h1>
          <p>Quản lý các cuộc họp của bạn</p>
        </div>

        {user?.role === "admin" && (
          <div className="admin-section">
            <button className="btn-create-meeting" onClick={() => setShowCreateForm(!showCreateForm)}>
              + Tạo cuộc họp mới
            </button>

            {showCreateForm && (
              <form onSubmit={handleCreateMeeting} className="create-meeting-form">
                <div className="form-group">
                  <label>Tiêu đề cuộc họp</label>
                  <input
                    type="text"
                    name="title"
                    placeholder="Nhập tiêu đề cuộc họp"
                    value={formData.title}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Mô tả</label>
                  <textarea
                    name="description"
                    placeholder="Nhập mô tả cuộc họp"
                    value={formData.description}
                    onChange={handleChange}
                    rows="4"
                  />
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary">
                    Tạo cuộc họp
                  </button>
                  <button type="button" className="btn-cancel" onClick={() => setShowCreateForm(false)}>
                    Hủy
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="meetings-section">
          <h2>Danh sách cuộc họp</h2>

          {loading ? (
            <div className="loading">Đang tải...</div>
          ) : meetings.length === 0 ? (
            <div className="empty-state">
              <p>Chưa có cuộc họp nào</p>
            </div>
          ) : (
            <div className="meetings-grid">
              {meetings.map((meeting) => (
                <div key={meeting._id} className="meeting-card">
                  <h3>{meeting.title}</h3>
                  <p className="meeting-description">{meeting.description}</p>
                  <div className="meeting-meta">
                    <span className="meeting-creator">Tạo bởi: {meeting.createdBy?.fullName || meeting.createdBy?.email}</span>
                    <span className="meeting-date">{new Date(meeting.createdAt).toLocaleDateString("vi-VN")}</span>
                  </div>
                  <button
                    className="btn-join"
                    onClick={() => {
                      if (meeting.roomId) {
                        navigate(`/meeting/${meeting.roomId}`)
                      }
                    }}
                  >
                    Tham gia cuộc họp
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

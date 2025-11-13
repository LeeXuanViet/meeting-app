"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { meetingAPI, documentAPI } from "../api/auth"
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
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

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
    setUploading(true)
    setUploadError(null)
    
    try {
      // Create meeting first
      const response = await meetingAPI.createMeeting(formData)
      const newMeeting = response.data.meeting
      
      // If file is selected, upload it after meeting is created
      if (selectedFile && newMeeting?.roomId) {
        try {
          const formDataUpload = new FormData()
          formDataUpload.append("document", selectedFile)
          formDataUpload.append("roomId", newMeeting.roomId)
          
          await documentAPI.uploadDocument(formDataUpload)
          console.log("Document uploaded successfully")
        } catch (uploadErr) {
          console.error("Error uploading document:", uploadErr)
          setUploadError("Cuộc họp đã được tạo nhưng upload tài liệu thất bại: " + (uploadErr.response?.data?.message || uploadErr.message))
        }
      }
      
      // Reset form
      setFormData({ title: "", description: "" })
      setSelectedFile(null)
      setShowCreateForm(false)
      fetchMeetings()
    } catch (error) {
      console.error("Error creating meeting:", error)
      setUploadError(error.response?.data?.message || "Lỗi khi tạo cuộc họp")
    } finally {
      setUploading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
      ]

      if (!allowedTypes.includes(file.type)) {
        setUploadError("Chỉ hỗ trợ file PDF, DOCX, DOC, TXT (tối đa 10MB)")
        return
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError("File quá lớn. Tối đa 10MB")
        return
      }

      setSelectedFile(file)
      setUploadError(null)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
    return (bytes / (1024 * 1024)).toFixed(2) + " MB"
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

                <div className="form-group">
                  <label>📄 Tài liệu (Tùy chọn)</label>
                  <div className="file-upload-section">
                    <input
                      type="file"
                      id="meeting-document-input"
                      accept=".pdf,.doc,.docx,.txt"
                      onChange={handleFileSelect}
                      className="file-input"
                    />
                    <label htmlFor="meeting-document-input" className="file-upload-label">
                      {selectedFile ? (
                        <div className="file-selected-info">
                          <span className="file-icon">📄</span>
                          <div className="file-details">
                            <span className="file-name">{selectedFile.name}</span>
                            <span className="file-size">{formatFileSize(selectedFile.size)}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setSelectedFile(null)
                              const fileInput = document.getElementById("meeting-document-input")
                              if (fileInput) fileInput.value = ""
                            }}
                            className="btn-remove-file"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="file-upload-placeholder">
                          <span className="upload-icon">📤</span>
                          <span>Chọn tài liệu để upload (PDF, DOCX, DOC, TXT - tối đa 10MB)</span>
                        </div>
                      )}
                    </label>
                  </div>
                  {uploadError && <div className="form-error">{uploadError}</div>}
                </div>

                <div className="form-actions">
                  <button type="submit" className="btn-primary" disabled={uploading}>
                    {uploading ? "Đang tạo..." : "Tạo cuộc họp"}
                  </button>
                  <button 
                    type="button" 
                    className="btn-cancel" 
                    onClick={() => {
                      setShowCreateForm(false)
                      setSelectedFile(null)
                      setUploadError(null)
                      const fileInput = document.getElementById("meeting-document-input")
                      if (fileInput) fileInput.value = ""
                    }}
                    disabled={uploading}
                  >
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

"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { io } from "socket.io-client"
import { useAuth } from "../hooks/useAuth"
// import { meetingAPI } from "../api/auth"
import client from "../api/client"
import Navbar from "../components/Navbar"
import VideoCall from "../components/VideoCall"
import "../styles/MeetingRoom.css"
import "../styles/VideoCall.css"

export default function MeetingRoomPage() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [meeting, setMeeting] = useState(null)
  const [participants, setParticipants] = useState([])
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState("")
  const [typingUsers, setTypingUsers] = useState([])
  const [chatMode, setChatMode] = useState("public") // "public" or "private"
  const [selectedUser, setSelectedUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showVideoCall, setShowVideoCall] = useState(false)
  const [activeTab, setActiveTab] = useState("live") // 'meetings' | 'chat' | 'live'
  const [meetingsList, setMeetingsList] = useState([])
  const socketRef = useRef(null)
  const initializedRef = useRef(false)
  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const seenMessageIdsRef = useRef(new Set())

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    initializeMeeting()
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.removeAllListeners?.()
        } catch {}
        socketRef.current.disconnect()
      }
      initializedRef.current = false
    }
  }, [roomId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const initializeMeeting = async () => {
    try {
      // Lấy thông tin meeting theo roomId với token hiện tại; nếu không có, thử coi tham số là _id và redirect
      let response
      try {
        response = await client.get(`/meetings/room/${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      } catch (e) {
        // Nếu 404, thử lấy theo _id
        try {
          const byId = await client.get(`/meetings/${roomId}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (byId?.data?.roomId) {
            navigate(`/meeting/${byId.data.roomId}`, { replace: true })
            return
          }
        } catch (_) {}
        throw e
      }

      setMeeting(response.data)

      // Kết nối Socket.IO
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:5000"
      const socket = io(API_URL.replace("/api", ""), {
        auth: {
          token: token,
        },
        transports: ["websocket", "polling"],
      })

      socketRef.current = socket

      // Xử lý kết nối
      socket.on("connect", () => {
        console.log("Connected to server")
        // Tham gia meeting room
        socket.emit("join-meeting", {
          roomId: roomId,
        })
      })

      socket.on("connect_error", (err) => {
        console.error("Connection error:", err)
        setError("Không thể kết nối đến server")
      })

      // Đã tham gia meeting thành công
      socket.on("joined-meeting", (data) => {
        console.log("Joined meeting:", data)
        setLoading(false)
      })

      // Nhận danh sách participants hiện tại
      socket.on("current-participants", (data) => {
        setParticipants(data.participants)
      })

      // User mới tham gia
      socket.on("user-joined", (data) => {
        setParticipants(data.participants)
        addSystemMessage(`${data.user.name} đã tham gia cuộc họp`)
      })

      // User rời khỏi
      socket.on("user-left", (data) => {
        setParticipants(data.participants)
        addSystemMessage(`${data.user.name} đã rời khỏi cuộc họp`)
      })

      // Nhận tin nhắn chat (đảm bảo không đăng ký trùng listener)
      socket.off("chat-message")
      socket.on("chat-message", (data) => {
        if (data?.id) {
          if (seenMessageIdsRef.current.has(data.id)) return
          seenMessageIdsRef.current.add(data.id)
        }
        setMessages((prev) => [...prev, data])
      })

      // Typing indicator (đảm bảo không đăng ký trùng listener)
      socket.off("typing")
      socket.on("typing", (data) => {
        if (data.isTyping) {
          setTypingUsers((prev) => {
            if (!prev.find((u) => u.userId === data.userId)) {
              return [...prev, { userId: data.userId, userName: data.userName }]
            }
            return prev
          })
        } else {
          setTypingUsers((prev) => prev.filter((u) => u.userId !== data.userId))
        }
      })

      // Lỗi
      socket.on("error", (error) => {
        setError(error.message)
      })

      setLoading(false)
    } catch (err) {
      console.error("Error initializing meeting:", err)
      setError("Không thể tải thông tin cuộc họp")
      setLoading(false)
    }
  }

  // Fetch meetings for Meetings tab
  const fetchMeetingsList = async () => {
    try {
      const res = await client.get("/meetings", { headers: { Authorization: `Bearer ${token}` } })
      setMeetingsList(res.data)
    } catch (e) {
      console.error("Error fetching meetings list:", e)
    }
  }

  const addSystemMessage = (text) => {
    setMessages((prev) => [
      ...prev,
      {
        userId: "system",
        userName: "Hệ thống",
        message: text,
        timestamp: new Date(),
        type: "system",
      },
    ])
  }

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!messageInput.trim() || !socketRef.current) return

    const messageData = {
      roomId: roomId,
      message: messageInput.trim(),
      messageType: chatMode,
      targetUserId: chatMode === "private" ? selectedUser?.userId : null,
    }

    socketRef.current.emit("chat-message", messageData)
    setMessageInput("")

    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }
    socketRef.current.emit("typing", {
      roomId: roomId,
      isTyping: false,
    })
  }

  const handleTyping = (e) => {
    setMessageInput(e.target.value)

    if (!socketRef.current) return

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Emit typing indicator
    socketRef.current.emit("typing", {
      roomId: roomId,
      isTyping: true,
    })

    // Clear typing after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit("typing", {
        roomId: roomId,
        isTyping: false,
      })
    }, 3000)
  }

  const handleLeaveMeeting = () => {
    if (socketRef.current) {
      socketRef.current.emit("leave-meeting", { roomId })
      socketRef.current.disconnect()
    }
    navigate("/dashboard")
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
  }

  if (loading) {
    return (
      <div className="meeting-room">
        <Navbar />
        <div className="meeting-loading">
          <div className="loading-spinner"></div>
          <p>Đang kết nối đến cuộc họp...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="meeting-room">
        <Navbar />
        <div className="meeting-error">
          <p>{error}</p>
          <button onClick={() => navigate("/dashboard")} className="btn-primary">
            Quay lại
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="meeting-room">
      <Navbar />
      <div className="meeting-room-container">
        {/* Header */}
        <div className="meeting-header">
          <div className="meeting-info">
            <h1>{meeting?.title}</h1>
            <p>{meeting?.description}</p>
            <div className="meeting-meta">
              <span className="participant-count">
                <span className="count-badge">{participants.length}</span> người tham gia
              </span>
              <span className="room-id">Room ID: {roomId}</span>
            </div>
          </div>
          <button onClick={handleLeaveMeeting} className="btn-leave">
            Rời cuộc họp
          </button>
        </div>

        {/* Tabs */}
        <div className="tabs-bar">
          <button
            className={`tab-btn ${activeTab === "meetings" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("meetings")
              fetchMeetingsList()
              setShowVideoCall(false)
            }}
          >
            📋 Cuộc họp
          </button>
          <button
            className={`tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("chat")
              setShowVideoCall(false)
            }}
          >
            💬 Trao đổi
          </button>
          <button
            className={`tab-btn ${activeTab === "live" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("live")
              setShowVideoCall(true)
            }}
          >
            🎥 Trực tuyến
          </button>
        </div>

        <div className="meeting-content">
          {/* Sidebar - Participants & Chat Mode */}
          <div className="meeting-sidebar">
            <div className="sidebar-section">
              <h3>Thành viên ({participants.length})</h3>
              <div className="participants-list">
                {participants.map((participant) => (
                  <div
                    key={participant.userId}
                    className={`participant-item ${selectedUser?.userId === participant.userId ? "selected" : ""}`}
                    onClick={() => {
                      if (participant.userId !== user?.id) {
                        setSelectedUser(participant)
                        setChatMode("private")
                      }
                    }}
                  >
                    <div className="participant-avatar">
                      {participant.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="participant-info">
                      <span className="participant-name">
                        {participant.userName}
                        {participant.userId === user?.id && " (Bạn)"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h3>Chế độ chat</h3>
              <div className="chat-mode-selector">
                <button
                  className={`chat-mode-btn ${chatMode === "public" ? "active" : ""}`}
                  onClick={() => {
                    setChatMode("public")
                    setSelectedUser(null)
                  }}
                >
                  💬 Tất cả
                </button>
                <button
                  className={`chat-mode-btn ${chatMode === "private" ? "active" : ""}`}
                  onClick={() => {
                    if (selectedUser) {
                      setChatMode("private")
                    }
                  }}
                  disabled={!selectedUser}
                >
                  🔒 Riêng tư
                  {selectedUser && `: ${selectedUser.userName}`}
                </button>
              </div>
            </div>
          </div>

          {/* Main Area (switch by tab) */}
          <div className="meeting-chat">
            {activeTab === "live" && (
              <>
                {!showVideoCall && (
                  <div className="chat-header"><h3>🎥 Trực tuyến</h3></div>
                )}
                <VideoCall participants={participants} socketRef={socketRef} roomId={roomId} user={user} />
              </>
            )}

            {activeTab === "meetings" && (
              <>
                <div className="chat-header"><h3>📋 Danh sách cuộc họp</h3></div>
                <div className="meetings-grid">
                  {meetingsList.map((m) => (
                    <div key={m._id} className="meeting-card">
                      <h3>{m.title}</h3>
                      <p className="meeting-description">{m.description}</p>
                      <div className="meeting-meta">
                        <span>Tạo bởi: {m.createdBy?.fullName || m.createdBy?.email}</span>
                        <span>{new Date(m.createdAt).toLocaleDateString("vi-VN")}</span>
                      </div>
                      <button
                        className="btn-join"
                        onClick={() => {
                          if (m.roomId) navigate(`/meeting/${m.roomId}`)
                        }}
                      >
                        Tham gia
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {activeTab === "chat" && (
            <div className="chat-header">
              <h3>
                {chatMode === "public" ? "💬 Chat công khai" : `🔒 Chat riêng với ${selectedUser?.userName}`}
              </h3>
            </div>
            )}

            {activeTab === "chat" && (<div className="messages-container" ref={messagesEndRef}>
              {messages.map((msg, index) => {
                const isOwnMessage = msg.userId === user?.id
                const isSystemMessage = msg.type === "system"
                const isPrivateMessage = msg.type === "private"

                return (
                  <div
                    key={index}
                    className={`message ${isOwnMessage ? "own" : ""} ${isSystemMessage ? "system" : ""} ${isPrivateMessage ? "private" : ""}`}
                  >
                    {!isSystemMessage && (
                      <div className="message-avatar">
                        {msg.userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="message-content">
                      {!isSystemMessage && (
                        <div className="message-header">
                          <span className="message-author">{msg.userName}</span>
                          {isPrivateMessage && (
                            <span className="private-badge">
                              {isOwnMessage && msg.targetUserId ? "🔒 Gửi riêng" : "🔒 Nhận riêng"}
                            </span>
                          )}
                          <span className="message-time">{formatTime(msg.timestamp)}</span>
                        </div>
                      )}
                      <div className="message-text">{msg.message}</div>
                    </div>
                  </div>
                )
              })}
              {typingUsers.length > 0 && (
                <div className="typing-indicator">
                  {typingUsers.map((typingUser) => (
                    <span key={typingUser.userId}>{typingUser.userName} đang gõ...</span>
                  ))}
                </div>
              )}
            </div>)}

            {activeTab === "chat" && (<form onSubmit={handleSendMessage} className="chat-input-form">
              <input
                type="text"
                value={messageInput}
                onChange={handleTyping}
                placeholder={chatMode === "public" ? "Nhập tin nhắn..." : `Nhập tin nhắn cho ${selectedUser?.userName}...`}
                className="chat-input"
                disabled={chatMode === "private" && !selectedUser}
              />
              <button type="submit" className="btn-send" disabled={!messageInput.trim()}>
                Gửi
              </button>
            </form>)}
          </div>
        </div>
      </div>
    </div>
  )
}

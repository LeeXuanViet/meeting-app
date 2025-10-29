import jwt from "jsonwebtoken"
import User from "../models/User.js"
import Meeting from "../models/Meeting.js"
import dotenv from "dotenv"

dotenv.config()

// Store active room participants
const activeRooms = new Map()

export const initializeSocket = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(" ")[1]

      if (!token) {
        return next(new Error("Token không được cung cấp"))
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.id)

      if (!user || !user.approved) {
        return next(new Error("Người dùng chưa được phê duyệt"))
      }

      socket.user = {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
      }

      next()
    } catch (error) {
      next(new Error("Token không hợp lệ"))
    }
  })

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.user.fullName} (${socket.id})`)

    // Join meeting room
    socket.on("join-meeting", async (data) => {
      try {
        const { roomId, meetingId } = data

        if (!roomId && !meetingId) {
          socket.emit("error", { message: "Room ID hoặc Meeting ID là bắt buộc" })
          return
        }

        let meeting
        if (meetingId) {
          meeting = await Meeting.findById(meetingId)
        } else if (roomId) {
          meeting = await Meeting.findOne({ roomId })
        }

        if (!meeting) {
          socket.emit("error", { message: "Phòng họp không tồn tại" })
          return
        }

        // Add user to meeting participants if not already in list
        if (!meeting.participants.includes(socket.user.id)) {
          meeting.participants.push(socket.user.id)
          await meeting.save()
        }

        // Join socket room
        socket.join(meeting.roomId)

        // Track active participants in memory
        if (!activeRooms.has(meeting.roomId)) {
          activeRooms.set(meeting.roomId, new Map())
        }

        const roomParticipants = activeRooms.get(meeting.roomId)
        roomParticipants.set(socket.id, {
          userId: socket.user.id,
          userName: socket.user.fullName,
          socketId: socket.id,
          joinedAt: new Date(),
        })

        // Update meeting status to ongoing if scheduled
        if (meeting.status === "scheduled") {
          meeting.status = "ongoing"
          await meeting.save()
        }

        // Notify user they successfully joined
        socket.emit("joined-meeting", {
          meetingId: meeting._id.toString(),
          roomId: meeting.roomId,
          title: meeting.title,
          description: meeting.description,
        })

        // Broadcast to others in the room that a new user joined
        const participantsList = Array.from(roomParticipants.values())
        socket.to(meeting.roomId).emit("user-joined", {
          user: {
            id: socket.user.id,
            name: socket.user.fullName,
          },
          participants: participantsList,
        })

        // Send current participants to the new joiner
        socket.emit("current-participants", {
          participants: participantsList,
        })

        console.log(`${socket.user.fullName} joined room ${meeting.roomId}`)
      } catch (error) {
        console.error("Error joining meeting:", error)
        socket.emit("error", { message: "Lỗi khi tham gia cuộc họp" })
      }
    })

    // Leave meeting room
    socket.on("leave-meeting", async (data) => {
      try {
        const { roomId } = data

        if (roomId && activeRooms.has(roomId)) {
          const roomParticipants = activeRooms.get(roomId)
          roomParticipants.delete(socket.id)

          // Clean up empty rooms
          if (roomParticipants.size === 0) {
            activeRooms.delete(roomId)
          } else {
            // Broadcast user left to remaining participants
            socket.to(roomId).emit("user-left", {
              user: {
                id: socket.user.id,
                name: socket.user.fullName,
              },
              participants: Array.from(roomParticipants.values()),
            })
          }

          socket.leave(roomId)
          console.log(`${socket.user.fullName} left room ${roomId}`)
        }
      } catch (error) {
        console.error("Error leaving meeting:", error)
      }
    })

    // Send chat message
    socket.on("chat-message", (data) => {
      const { roomId, message } = data

      if (!roomId || !message) return

      const messageData = {
        userId: socket.user.id,
        userName: socket.user.fullName,
        message,
        timestamp: new Date(),
      }

      // Broadcast message to all participants in the room (including sender)
      io.to(roomId).emit("chat-message", messageData)
    })

    // Send typing indicator
    socket.on("typing", (data) => {
      const { roomId, isTyping } = data
      if (roomId) {
        socket.to(roomId).emit("typing", {
          userId: socket.user.id,
          userName: socket.user.fullName,
          isTyping,
        })
      }
    })

    // Handle disconnection
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.user.fullName} (${socket.id})`)

      // Remove user from all active rooms
      for (const [roomId, participants] of activeRooms.entries()) {
        if (participants.has(socket.id)) {
          participants.delete(socket.id)

          // Clean up empty rooms
          if (participants.size === 0) {
            activeRooms.delete(roomId)
          } else {
            // Notify others in the room
            socket.to(roomId).emit("user-left", {
              user: {
                id: socket.user.id,
                name: socket.user.fullName,
              },
              participants: Array.from(participants.values()),
            })
          }
        }
      }
    })

    // Handle errors
    socket.on("error", (error) => {
      console.error("Socket error:", error)
    })
  })

  return io
}

export { activeRooms }

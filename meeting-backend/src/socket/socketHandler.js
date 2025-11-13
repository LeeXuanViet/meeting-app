import jwt from "jsonwebtoken"
import User from "../models/User.js"
import Meeting from "../models/Meeting.js"
import dotenv from "dotenv"
import crypto from "crypto"

dotenv.config()

// Danh sách các phòng họp đang hoạt động (roomId → Map các người tham gia)
const activeRooms = new Map()

// Bản đồ ánh xạ userId → socketId (để gửi tin nhắn riêng - private message)
const userSocketMap = new Map()


// ===============================
// 🚀 Hàm khởi tạo Socket.IO
// ===============================
export const initializeSocket = (io) => {

  // 🧩 Middleware xác thực mỗi khi có client kết nối qua socket
  io.use(async (socket, next) => {
    try {
      // Lấy token từ client (gửi kèm trong phần auth hoặc header)
      const token =
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.split(" ")[1]

      if (!token) {
        return next(new Error("Token không được cung cấp"))
      }

      // Giải mã token để xác định người dùng
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.id)

      // Nếu user không tồn tại hoặc chưa được admin duyệt → từ chối kết nối
      if (!user || !user.approved) {
        return next(new Error("Người dùng chưa được phê duyệt"))
      }

      // Lưu thông tin user vào socket (để dùng ở các sự kiện sau)
      socket.user = {
        id: user._id.toString(),
        email: user.email,
        fullName: user.fullName,
      }

      next() // Cho phép kết nối tiếp tục
    } catch (error) {
      next(new Error("Token không hợp lệ"))
    }
  })


  // ===============================
  // 🔌 Xử lý khi người dùng kết nối thành công
  // ===============================
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.user.fullName} (${socket.id})`)

    // Lưu ánh xạ user → socket (để hỗ trợ gửi tin nhắn riêng)
    userSocketMap.set(socket.user.id, socket.id)


    // =====================================
    // 👥 Sự kiện: Người dùng tham gia phòng họp
    // =====================================
    socket.on("join-meeting", async (data) => {
      try {
        const { roomId, meetingId } = data

        // Kiểm tra tham số đầu vào
        if (!roomId && !meetingId) {
          socket.emit("error", { message: "Room ID hoặc Meeting ID là bắt buộc" })
          return
        }

        // Tìm thông tin cuộc họp trong MongoDB
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

        // ✅ Thêm người dùng vào danh sách participants trong DB nếu chưa có
        if (!meeting.participants.includes(socket.user.id)) {
          meeting.participants.push(socket.user.id)
          await meeting.save()
        }

        // ✅ Socket tham gia vào phòng tương ứng (theo roomId)
        socket.join(meeting.roomId)

        // ✅ Nếu phòng chưa có trong RAM, khởi tạo mới
        if (!activeRooms.has(meeting.roomId)) {
          activeRooms.set(meeting.roomId, new Map())
        }

        // Lấy danh sách thành viên đang online trong phòng đó
        const roomParticipants = activeRooms.get(meeting.roomId)

        // Loại bỏ các entry cũ của cùng user (trường hợp refresh/reconnect)
        for (const [sId, p] of roomParticipants.entries()) {
          if (p.userId === socket.user.id) {
            roomParticipants.delete(sId)
          }
        }

        // Thêm người mới vào danh sách người đang hoạt động
        roomParticipants.set(socket.id, {
          userId: socket.user.id,
          userName: socket.user.fullName,
          socketId: socket.id,
          joinedAt: new Date(),
        })

        // 🔄 Nếu cuộc họp đang ở trạng thái “đã lên lịch” → chuyển sang “đang diễn ra”
        if (meeting.status === "scheduled") {
          meeting.status = "ongoing"
          await meeting.save()
        }

        // ✅ Gửi phản hồi cho chính người dùng là họ đã tham gia thành công
        socket.emit("joined-meeting", {
          meetingId: meeting._id.toString(),
          roomId: meeting.roomId,
          title: meeting.title,
          description: meeting.description,
        })

        // 🔔 Gửi thông báo đến những người khác trong phòng rằng có người mới vào
        // Dedupe theo userId để không hiển thị trùng
        const seen = new Set()
        const participantsList = []
        for (const p of roomParticipants.values()) {
          if (!seen.has(p.userId)) {
            seen.add(p.userId)
            participantsList.push(p)
          }
        }
        socket.to(meeting.roomId).emit("user-joined", {
          user: {
            id: socket.user.id,
            name: socket.user.fullName,
          },
          participants: participantsList,
        })

        // 👥 Gửi danh sách người đang trong phòng cho người vừa mới vào
        socket.emit("current-participants", { participants: participantsList })

        console.log(`${socket.user.fullName} joined room ${meeting.roomId}`)
      } catch (error) {
        console.error("Error joining meeting:", error)
        socket.emit("error", { message: "Lỗi khi tham gia cuộc họp" })
      }
    })


    // =====================================
    // 🚪 Sự kiện: Rời khỏi phòng họp
    // =====================================
    socket.on("leave-meeting", async (data) => {
      try {
        const { roomId } = data

        if (roomId && activeRooms.has(roomId)) {
          const roomParticipants = activeRooms.get(roomId)
          roomParticipants.delete(socket.id) // Xóa người này khỏi danh sách

          // Nếu phòng trống → xóa khỏi danh sách activeRooms
          if (roomParticipants.size === 0) {
            activeRooms.delete(roomId)
          } else {
            // Gửi thông báo cho những người còn lại (loại trùng theo userId)
            const seen = new Set()
            const uniqueList = []
            for (const p of roomParticipants.values()) {
              if (!seen.has(p.userId)) {
                seen.add(p.userId)
                uniqueList.push(p)
              }
            }
            socket.to(roomId).emit("user-left", {
              user: {
                id: socket.user.id,
                name: socket.user.fullName,
              },
              participants: uniqueList,
            })
          }

          // Socket rời khỏi phòng
          socket.leave(roomId)
          console.log(`${socket.user.fullName} left room ${roomId}`)
        }
      } catch (error) {
        console.error("Error leaving meeting:", error)
      }
    })


    // =====================================
    // 💬 Sự kiện: Gửi tin nhắn (công khai hoặc riêng tư)
    // =====================================
    socket.on("chat-message", (data) => {
      const { roomId, message, targetUserId, messageType = "public" } = data

      if (!roomId || !message) return

      const messageData = {
        id: crypto.randomBytes(8).toString("hex"),
        userId: socket.user.id,
        userName: socket.user.fullName,
        message,
        timestamp: new Date(),
        type: messageType,
        targetUserId: targetUserId || null,
      }

      // 🔒 Tin nhắn riêng tư (1-1)
      if (messageType === "private" && targetUserId) {
        const targetSocketId = userSocketMap.get(targetUserId)

        if (targetSocketId) {
          // Gửi tin nhắn cho người nhận
          io.to(targetSocketId).emit("chat-message", messageData)
          // Gửi lại cho người gửi để hiển thị trong UI
          socket.emit("chat-message", messageData)
        } else {
          socket.emit("error", { message: "Người dùng không trực tuyến" })
        }
      } else {
        // 🌐 Tin nhắn công khai - gửi đến tất cả trong phòng
        io.to(roomId).emit("chat-message", messageData)
      }
    })


    // =====================================
    // ✍️ Sự kiện: Người dùng đang nhập (typing)
    // =====================================
    socket.on("typing", (data) => {
      const { roomId, isTyping } = data
      if (roomId) {
        // Gửi thông báo cho các thành viên khác trong phòng
        socket.to(roomId).emit("typing", {
          userId: socket.user.id,
          userName: socket.user.fullName,
          isTyping,
        })
      }
    })


    // =====================================
    // ❌ Sự kiện: Ngắt kết nối (đóng tab, mất mạng, v.v.)
    // =====================================
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${socket.user.fullName} (${socket.id})`)

      // Xóa ánh xạ user → socket
      userSocketMap.delete(socket.user.id)

      // Xóa user khỏi tất cả phòng đang hoạt động
      for (const [roomId, participants] of activeRooms.entries()) {
        if (participants.has(socket.id)) {
          participants.delete(socket.id)

          if (participants.size === 0) {
            activeRooms.delete(roomId)
          } else {
            // Thông báo cho người khác trong phòng (loại trùng theo userId)
            const seen = new Set()
            const uniqueList = []
            for (const p of participants.values()) {
              if (!seen.has(p.userId)) {
                seen.add(p.userId)
                uniqueList.push(p)
              }
            }
            socket.to(roomId).emit("user-left", {
              user: {
                id: socket.user.id,
                name: socket.user.fullName,
              },
              participants: uniqueList,
            })
          }
        }
      }
    })


    // =====================================
    // ⚠️ Xử lý lỗi socket
    // =====================================
    socket.on("error", (error) => {
      console.error("Socket error:", error)
    })

    // =====================================
    // 📹 WebRTC Video Call Events
    // =====================================

    // User muốn bật/tắt video/mic/screen share
    socket.on("media-toggle", (data) => {
      const { roomId, mediaType, enabled } = data
      if (roomId) {
        // Broadcast state change đến tất cả người trong phòng
        socket.to(roomId).emit("media-toggle", {
          userId: socket.user.id,
          userName: socket.user.fullName,
          mediaType, // "video" | "audio" | "screen"
          enabled,
        })
      }
    })

    // WebRTC Offer (caller gửi offer cho callee)
    socket.on("webrtc-offer", (data) => {
      const { roomId, targetUserId, offer } = data
      console.log(`[Socket] Received webrtc-offer from ${socket.user.id} (${socket.user.fullName}) to ${targetUserId}`)
      const targetSocketId = userSocketMap.get(targetUserId)
      if (targetSocketId) {
        console.log(`[Socket] Relaying webrtc-offer to socket ${targetSocketId} (userId: ${targetUserId})`)
        io.to(targetSocketId).emit("webrtc-offer", {
          fromUserId: socket.user.id,
          fromUserName: socket.user.fullName,
          offer,
        })
      } else {
        console.error(`[Socket] Cannot relay webrtc-offer: targetUserId ${targetUserId} not found in userSocketMap. Current map:`, Array.from(userSocketMap.entries()).map(([uid, sid]) => ({ userId: uid, socketId: sid })))
      }
    })

    // WebRTC Answer (callee trả lời offer)
    socket.on("webrtc-answer", (data) => {
      const { roomId, targetUserId, answer } = data
      console.log(`[Socket] Received webrtc-answer from ${socket.user.id} (${socket.user.fullName}) to ${targetUserId}`)
      const targetSocketId = userSocketMap.get(targetUserId)
      if (targetSocketId) {
        console.log(`[Socket] Relaying webrtc-answer to socket ${targetSocketId} (userId: ${targetUserId})`)
        io.to(targetSocketId).emit("webrtc-answer", {
          fromUserId: socket.user.id,
          fromUserName: socket.user.fullName,
          answer,
        })
      } else {
        console.error(`[Socket] Cannot relay webrtc-answer: targetUserId ${targetUserId} not found in userSocketMap`)
      }
    })

    // ICE Candidate (thông tin kết nối mạng)
    socket.on("webrtc-ice-candidate", (data) => {
      const { roomId, targetUserId, candidate } = data
      const targetSocketId = userSocketMap.get(targetUserId)
      if (targetSocketId) {
        io.to(targetSocketId).emit("webrtc-ice-candidate", {
          fromUserId: socket.user.id,
          candidate,
        })
      } else {
        console.warn(`[Socket] Cannot relay webrtc-ice-candidate: targetUserId ${targetUserId} not found`)
      }
    })

    // User kết thúc call
    socket.on("webrtc-end-call", (data) => {
      const { roomId } = data
      if (roomId) {
        socket.to(roomId).emit("webrtc-end-call", {
          userId: socket.user.id,
          userName: socket.user.fullName,
        })
      }
    })

    // User yêu cầu call lại (trường hợp reconnect)
    socket.on("webrtc-reconnect-request", (data) => {
      const { roomId } = data
      if (roomId && activeRooms.has(roomId)) {
        const roomParticipants = activeRooms.get(roomId)
        const seen = new Set()
        const participants = []
        for (const p of roomParticipants.values()) {
          if (!seen.has(p.userId)) {
            seen.add(p.userId)
            participants.push(p)
          }
        }
        // Gửi danh sách participants cho user đang reconnect
        socket.emit("webrtc-participants-list", { participants })
      }
    })
  })

  return io
}

// Xuất ra để các module khác có thể truy cập danh sách phòng hoặc người dùng
export { activeRooms, userSocketMap }

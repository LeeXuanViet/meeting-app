# Meeting Backend - Setup Guide

## Tổng quan

Backend đã được nâng cấp để hỗ trợ họp trực tuyến (online meetings) với các tính năng:

1. **Socket.IO Integration** - Kết nối real-time giữa các thành viên
2. **Room Management** - Quản lý phòng họp với unique room IDs
3. **Participant Tracking** - Theo dõi thành viên tham gia trong thời gian thực
4. **Chat Real-time** - Chat trong cuộc họp
5. **Meeting Status** - Trạng thái cuộc họp (scheduled/ongoing/completed)

## Cài đặt

### 1. Cài đặt Dependencies

```bash
cd meeting-backend
npm install
```

Dependencies mới đã được thêm:
- `socket.io@^4.8.1` - Cho real-time communication

### 2. Cấu hình Environment Variables

Tạo file `.env` trong `meeting-backend/` với nội dung:

```env
MONGO_URI=mongodb://127.0.0.1:27017/meeting-app
JWT_SECRET=your-secret-key-change-this-in-production
PORT=5000
CLIENT_URL=http://localhost:3000
```

Sao chép từ `env.example`:
```bash
cp env.example .env
```

### 3. Database Migration

Meeting model đã được cập nhật với field mới `roomId`. 
Tất cả meeting mới tạo sẽ tự động có `roomId` unique.

Nếu có meetings cũ trong database, bạn cần migrate:
- Backup database trước
- Thêm `roomId` cho các meetings cũ hoặc xóa chúng

### 4. Chạy Backend Server

```bash
# Development mode (với nodemon)
npm run dev

# Production mode
npm start
```

Server sẽ chạy trên `http://localhost:5000`

## Cấu trúc mới

### Models

**Meeting.js** - Đã cập nhật:
```javascript
{
  title: String,
  description: String,
  roomId: String (unique, required, auto-generated),
  createdBy: ObjectId,
  participants: [ObjectId],
  startTime: Date,
  endTime: Date,
  status: "scheduled" | "ongoing" | "completed",
  createdAt: Date,
  updatedAt: Date
}
```

### Routes

**meeting.js** - Đã thêm endpoints mới:
- `GET /api/meetings/room/:roomId` - Lấy meeting theo room ID
- `POST /api/meetings/room/:roomId/join` - Tham gia meeting theo room ID

### Socket.IO Handler

**src/socket/socketHandler.js** - File mới:

#### Events - Client gửi lên Server:
1. `join-meeting` - Tham gia phòng họp
   ```js
   socket.emit('join-meeting', {
     roomId: 'abc123',     // Hoặc
     meetingId: '...'      // Optional
   })
   ```

2. `leave-meeting` - Rời phòng họp
   ```js
   socket.emit('leave-meeting', {
     roomId: 'abc123'
   })
   ```

3. `chat-message` - Gửi tin nhắn
   ```js
   socket.emit('chat-message', {
     roomId: 'abc123',
     message: 'Hello everyone!'
   })
   ```

4. `typing` - Thông báo đang gõ
   ```js
   socket.emit('typing', {
     roomId: 'abc123',
     isTyping: true
   })
   ```

#### Events - Server gửi xuống Client:
1. `joined-meeting` - Xác nhận đã tham gia
   ```js
   socket.on('joined-meeting', (data) => {
     // data = { meetingId, roomId, title, description }
   })
   ```

2. `user-joined` - User khác đã tham gia
   ```js
   socket.on('user-joined', (data) => {
     // data = { user, participants }
   })
   ```

3. `user-left` - User đã rời
   ```js
   socket.on('user-left', (data) => {
     // data = { user, participants }
   })
   ```

4. `current-participants` - Danh sách thành viên hiện tại
   ```js
   socket.on('current-participants', (data) => {
     // data = { participants: [...] }
   })
   ```

5. `chat-message` - Tin nhắn mới
   ```js
   socket.on('chat-message', (data) => {
     // data = { userId, userName, message, timestamp }
   })
   ```

6. `typing` - Thông báo ai đang gõ
   ```js
   socket.on('typing', (data) => {
     // data = { userId, userName, isTyping }
   })
   ```

7. `error` - Lỗi
   ```js
   socket.on('error', (error) => {
     // error = { message }
   })
   ```

### Authentication

Socket.IO yêu cầu JWT token:
- Token trong `socket.handshake.auth.token`
- Hoặc trong `socket.handshake.headers.authorization` (Bearer token)
- User phải có `approved: true`

## API Endpoints mới

### GET /api/meetings/room/:roomId
Lấy thông tin meeting theo room ID

**Request:**
```bash
GET /api/meetings/room/abc123
Authorization: Bearer <token>
```

**Response:**
```json
{
  "_id": "...",
  "roomId": "abc123",
  "title": "Meeting Title",
  "description": "...",
  "participants": [...],
  "status": "ongoing",
  ...
}
```

### POST /api/meetings/room/:roomId/join
Tham gia meeting theo room ID

**Request:**
```bash
POST /api/meetings/room/abc123/join
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Tham gia cuộc họp thành công",
  "meeting": { ... }
}
```

## Frontend Integration

### Cài đặt Socket.IO Client

```bash
cd meeting-frontend
npm install socket.io-client
```

### Kết nối Socket.IO

```javascript
import { io } from 'socket.io-client';

// Lấy token từ localStorage
const token = localStorage.getItem('token');

// Kết nối đến server
const socket = io('http://localhost:5000', {
  auth: {
    token: token
  }
});

// Xử lý kết nối
socket.on('connect', () => {
  console.log('Connected to server');
});

// Tham gia meeting
socket.emit('join-meeting', {
  roomId: 'abc123'
});

// Lắng nghe sự kiện
socket.on('joined-meeting', (data) => {
  console.log('Joined meeting:', data);
});

socket.on('user-joined', (data) => {
  console.log('New user joined:', data);
});
```

## Testing

### Test Socket.IO Connection

1. Start backend server
2. Connect from client với JWT token
3. Join a meeting room
4. Test các events

### Test API Endpoints

Sử dụng Postman hoặc cURL:

```bash
# Lấy danh sách meetings
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/meetings

# Lấy meeting theo room ID
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/meetings/room/abc123

# Join meeting
curl -X POST -H "Authorization: Bearer <token>" http://localhost:5000/api/meetings/room/abc123/join
```

## Security

- JWT authentication required cho tất cả endpoints và socket connections
- User phải được approved trước khi có thể tham gia
- CORS configured cho frontend
- Room IDs là unique và secure (random hex string)
- Socket.IO có authentication middleware

## Troubleshooting

### Port đã được sử dụng
```bash
# Thay đổi PORT trong .env
PORT=5001
```

### Socket.IO không connect
- Kiểm tra CORS settings
- Kiểm tra JWT token hợp lệ
- Kiểm tra user đã approved
- Kiểm tra CLIENT_URL trong .env

### Room ID không unique
Đã tự động check và regenerate nếu trùng.

## Next Steps

Sau khi hoàn thành backend:
1. Frontend cần cài socket.io-client
2. Tạo MeetingRoom component để hiển thị meeting
3. Implement chat UI
4. Implement participant list
5. Add audio/video support (WebRTC)

Xem thêm trong `MEETING_BACKEND_SUMMARY.md`

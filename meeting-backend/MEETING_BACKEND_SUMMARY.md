# Backend Meeting System - Real-time Online Meetings

## Overview
This backend has been enhanced to support real-time online meetings with Socket.IO integration. Users can now join meetings, see participants in real-time, chat, and track meeting status.

## New Features

### 1. Socket.IO Integration
- Real-time communication using WebSockets
- Support for multiple concurrent meeting rooms
- Participant tracking and management

### 2. Meeting Model Updates
- Added `roomId` field to each meeting (unique identifier for WebSocket rooms)
- Each meeting now has a unique room ID for real-time connections

### 3. Socket Events

#### Client → Server Events:
- `join-meeting`: Join a meeting room
  ```js
  {
    roomId: "abc123",    // Room ID
    meetingId: "..."     // Optional: Meeting database ID
  }
  ```

- `leave-meeting`: Leave a meeting room
  ```js
  {
    roomId: "abc123"
  }
  ```

- `chat-message`: Send a chat message
  ```js
  // Public chat (gửi cho tất cả mọi người)
  {
    roomId: "abc123",
    message: "Hello everyone!",
    messageType: "public"  // default
  }

  // Private chat (1-1 với 1 người cụ thể)
  {
    roomId: "abc123",
    message: "Hello, this is a private message",
    messageType: "private",
    targetUserId: "user123"  // ID của người nhận
  }
  ```

- `typing`: Send typing indicator
  ```js
  {
    roomId: "abc123",
    isTyping: true
  }
  ```

#### Server → Client Events:
- `joined-meeting`: Confirmation of successful join
- `user-joined`: Notification when a user joins
- `user-left`: Notification when a user leaves
- `current-participants`: List of current participants
- `chat-message`: New chat message
- `typing`: Typing indicator from another user
- `error`: Error messages

### 4. API Endpoints

#### GET `/api/meetings`
Get all meetings (requires authentication)

#### GET `/api/meetings/:id`
Get meeting by ID (requires authentication)

#### GET `/api/meetings/room/:roomId`
Get meeting by room ID (requires authentication)

#### POST `/api/meetings` (Admin only)
Create a new meeting with auto-generated room ID

#### POST `/api/meetings/:id/join`
Join a meeting by meeting ID

#### POST `/api/meetings/room/:roomId/join`
Join a meeting by room ID

#### PUT `/api/meetings/:id` (Admin only)
Update meeting details

#### DELETE `/api/meetings/:id` (Admin only)
Delete a meeting

## Meeting Status
- `scheduled`: Meeting is scheduled
- `ongoing`: Meeting is currently active
- `completed`: Meeting has ended

## Authentication
- All socket connections require JWT authentication
- Token is passed via `socket.handshake.auth.token` or `socket.handshake.headers.authorization`

## Room Management
- Active rooms are tracked in memory (`activeRooms` Map)
- Automatically cleans up when rooms are empty
- Tracks participants per room in real-time

## How to Use

### Starting the Server
```bash
cd meeting-backend
npm run dev  # Development with nodemon
npm start     # Production
```

### Environment Variables Needed
```env
MONGO_URI=mongodb://localhost:27017/meeting-app
JWT_SECRET=your-secret-key
PORT=5000
CLIENT_URL=http://localhost:3000  # For CORS
```

### Database Migration
The Meeting model now includes a `roomId` field. Existing meetings will need to be updated with room IDs. You can create a migration script if needed.

## Socket.IO Client Connection

To connect from the frontend:
```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: {
    token: 'your-jwt-token'
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('joined-meeting', (data) => {
  console.log('Joined meeting:', data);
});

socket.emit('join-meeting', {
  roomId: 'abc123'
});
```

## Security Features
- JWT-based authentication for all endpoints and socket connections
- User approval check before allowing socket connections
- CORS configuration for frontend access
- Admin-only endpoints for meeting management

## Next Steps
- Implement video/audio streaming support
- Add meeting recordings
- Add screen sharing capabilities
- Implement moderator controls
- Add meeting history and transcripts

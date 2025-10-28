# Meeting App - Giai đoạn 1

Ứng dụng họp trực tuyến với hệ thống xác thực, quản lý người dùng, và bảng điều khiển admin.

## Tính năng

- **Đăng ký/Đăng nhập**: Email + Mật khẩu hoặc Google OAuth
- **Duyệt người dùng**: Admin duyệt người dùng mới trước khi hoạt động
- **Quản lý cuộc họp**: Admin tạo cuộc họp, người dùng xem danh sách
- **Bảng điều khiển Admin**: Thống kê người dùng, duyệt/xóa người dùng

## Cấu trúc dự án

\`\`\`
meeting-app/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/db.js
│   │   ├── models/User.js, Meeting.js
│   │   ├── routes/auth.js, meeting.js, user.js
│   │   └── middleware/authMiddleware.js
│   ├── .env
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── styles/
│   │   ├── App.js
│   │   └── index.js
│   ├── public/
│   ├── .env
│   └── package.json
└── README.md
\`\`\`

## Setup Backend

1. **Cài đặt dependencies**:
   \`\`\`bash
   cd backend
   npm install
   \`\`\`

2. **Cấu hình MongoDB**:
   - Đảm bảo MongoDB chạy trên `mongodb://127.0.0.1:27017`
   - Hoặc cập nhật `MONGO_URI` trong `.env`

3. **Cấu hình Google OAuth**:
   - Truy cập [Google Cloud Console](https://console.cloud.google.com/)
   - Tạo OAuth 2.0 Client ID
   - Cập nhật `GOOGLE_CLIENT_ID` và `GOOGLE_CLIENT_SECRET` trong `.env`

4. **Chạy server**:
   \`\`\`bash
   npm start
   \`\`\`
   Server sẽ chạy trên `http://localhost:5000`

## Setup Frontend

1. **Cài đặt dependencies**:
   \`\`\`bash
   cd frontend
   npm install
   \`\`\`

2. **Cấu hình Google OAuth**:
   - Cập nhật `REACT_APP_GOOGLE_CLIENT_ID` trong `.env`

3. **Chạy ứng dụng**:
   \`\`\`bash
   npm start
   \`\`\`
   Ứng dụng sẽ mở trên `http://localhost:3000`

## API Endpoints

### Auth
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `POST /api/auth/google-callback` - Google OAuth callback

### Users (Admin only)
- `GET /api/users/pending` - Danh sách chờ duyệt
- `GET /api/users/stats` - Thống kê người dùng
- `PATCH /api/users/approve/:id` - Duyệt người dùng
- `DELETE /api/users/:id` - Xóa người dùng

### Meetings (Admin only)
- `POST /api/meetings` - Tạo cuộc họp
- `GET /api/meetings` - Danh sách cuộc họp

## Tài khoản Test

Sau khi setup, bạn có thể:
1. Đăng ký tài khoản mới
2. Dùng tài khoản admin để duyệt người dùng
3. Tạo cuộc họp và xem danh sách

## Giai đoạn tiếp theo

- Giai đoạn 2: Hệ thống auth nâng cao
- Giai đoạn 3: Chat real-time (Socket.io)
- Giai đoạn 4: WebRTC video call
- Giai đoạn 5: Upload file
- Giai đoạn 6: Biên bản họp (Whisper/PhoWhisper)
- Giai đoạn 7: Triển khai lên server

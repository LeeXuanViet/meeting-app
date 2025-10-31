import client from "./client"

export const authAPI = {
  register: (data) => client.post("/auth/register", data),
  login: (data) => client.post("/auth/login", data),
  googleCallback: (data) => client.post("/auth/google-callback", data),
}

export const userAPI = {
  getPendingUsers: () => client.get("/users/pending"),
  getStats: () => client.get("/users/stats"),
  approveUser: (id) => client.patch(`/users/approve/${id}`),
  deleteUser: (id) => client.delete(`/users/${id}`),
}

export const meetingAPI = {
  createMeeting: (data) => client.post("/meetings", data),
  getMeetings: () => client.get("/meetings"),
  getMeetingById: (id) => client.get(`/meetings/${id}`),
  getMeetingByRoomId: (roomId) => client.get(`/meetings/room/${roomId}`),
  joinMeetingById: (id) => client.post(`/meetings/${id}/join`),
  joinMeetingByRoomId: (roomId) => client.post(`/meetings/room/${roomId}/join`),
}

import axios from "axios"

const API_URL = process.env.REACT_APP_API_URL || "https://bkmeeting.soict.io/api"

const client = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
})

// Add token to requests (prefer sessionStorage for per-tab isolation)
client.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token") || localStorage.getItem("token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle responses
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token")
      localStorage.removeItem("user")
      window.location.href = "/login"
    }
    return Promise.reject(error)
  },
)

export default client

"use client"

import { createContext, useState, useEffect } from "react"

export const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Prefer sessionStorage (per-tab isolation). Fallback to localStorage once for backward compatibility
    const sessionToken = sessionStorage.getItem("token")
    const sessionUser = sessionStorage.getItem("user")
    const localToken = localStorage.getItem("token")
    const localUser = localStorage.getItem("user")

    if (sessionToken && sessionUser) {
      setToken(sessionToken)
      setUser(JSON.parse(sessionUser))
    } else if (localToken && localUser) {
      // Migrate: load once from localStorage into sessionStorage so subsequent reloads stay tab-scoped
      setToken(localToken)
      setUser(JSON.parse(localUser))
      sessionStorage.setItem("token", localToken)
      sessionStorage.setItem("user", localUser)
    }
    setLoading(false)
  }, [])

  const login = (token, userData) => {
    setToken(token)
    setUser(userData)
    // Store per-tab to avoid cross-tab account overwrites
    sessionStorage.setItem("token", token)
    sessionStorage.setItem("user", JSON.stringify(userData))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    sessionStorage.removeItem("token")
    sessionStorage.removeItem("user")
  }

  return <AuthContext.Provider value={{ user, token, loading, login, logout }}>{children}</AuthContext.Provider>
}

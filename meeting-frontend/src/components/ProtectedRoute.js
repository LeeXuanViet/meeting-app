"use client"
import { Navigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"

export const ProtectedRoute = ({ children, requiredRole = null }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/dashboard" />
  }

  return children
}

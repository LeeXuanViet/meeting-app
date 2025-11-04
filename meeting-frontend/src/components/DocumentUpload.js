import { useState } from "react"
import { documentAPI } from "../api/auth"
import "../styles/DocumentUpload.css"

export default function DocumentUpload({ roomId, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
      ]

      if (!allowedTypes.includes(file.type)) {
        setError("Chỉ hỗ trợ file PDF, DOCX, DOC, TXT (tối đa 10MB)")
        return
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError("File quá lớn. Tối đa 10MB")
        return
      }

      setSelectedFile(file)
      setError(null)
      setSuccess(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile || !roomId) return

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      formData.append("document", selectedFile)
      formData.append("roomId", roomId)

      const response = await documentAPI.uploadDocument(formData)

      setSuccess("Tài liệu đã được upload thành công. Đang xử lý...")
      setSelectedFile(null)

      // Reset file input
      const fileInput = document.getElementById("document-upload-input")
      if (fileInput) fileInput.value = ""

      if (onUploadSuccess) {
        onUploadSuccess(response.data)
      }
    } catch (err) {
      setError(err.response?.data?.message || "Lỗi khi upload tài liệu")
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB"
    return (bytes / (1024 * 1024)).toFixed(2) + " MB"
  }

  return (
    <div className="document-upload">
      <div className="upload-header">
        <h3>📄 Upload Tài liệu</h3>
        <p className="upload-hint">Hỗ trợ: PDF, DOCX, DOC, TXT (tối đa 10MB)</p>
      </div>

      <div className="upload-area">
        <input
          type="file"
          id="document-upload-input"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="file-input"
        />
        <label htmlFor="document-upload-input" className="file-label">
          {selectedFile ? (
            <div className="file-selected">
              <span className="file-icon">📄</span>
              <div className="file-info">
                <span className="file-name">{selectedFile.name}</span>
                <span className="file-size">{formatFileSize(selectedFile.size)}</span>
              </div>
            </div>
          ) : (
            <div className="file-placeholder">
              <span className="upload-icon">📤</span>
              <span>Chọn file để upload</span>
            </div>
          )}
        </label>
      </div>

      {selectedFile && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="btn-upload"
        >
          {uploading ? "Đang upload..." : "Upload"}
        </button>
      )}

      {error && <div className="upload-error">{error}</div>}
      {success && <div className="upload-success">{success}</div>}
    </div>
  )
}

import { useState, useRef, useEffect } from "react"
import { documentAPI } from "../api/auth"
import "../styles/RAGChatbox.css"

export default function RAGChatbox({ roomId }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Xin chào! Tôi là trợ lý AI. Bạn có thể hỏi tôi về nội dung trong các tài liệu đã được upload trong cuộc họp này.",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const handleSend = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setLoading(true)

    try {
      const response = await documentAPI.ragChat({
        roomId: roomId,
        query: input.trim(),
      })

      const assistantMessage = {
        role: "assistant",
        content: response.data.answer,
        sources: response.data.sources || [],
        confidence: response.data.confidence,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      const errorMessage = {
        role: "assistant",
        content: error.response?.data?.answer || "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi của bạn.",
        error: true,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="rag-chatbox">
      <div className="chatbox-header">
        <h3>🤖 AI Trợ lý</h3>
        <p className="chatbox-subtitle">Hỏi về nội dung tài liệu đã upload</p>
      </div>

      <div className="chatbox-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-content">
              <div className="message-text">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="message-sources">
                  <div className="sources-header">📚 Nguồn tham khảo:</div>
                  {msg.sources.map((source, idx) => (
                    <div key={idx} className="source-item">
                      <span className="source-file">{source.fileName}</span>
                      <span className="source-preview">{source.text}</span>
                      {source.similarity && (
                        <span className="source-confidence">
                          Độ liên quan: {(source.similarity * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div className="message-content">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSend} className="chatbox-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập câu hỏi về tài liệu..."
          className="chatbox-input"
          disabled={loading}
        />
        <button type="submit" className="btn-send" disabled={!input.trim() || loading}>
          Gửi
        </button>
      </form>
    </div>
  )
}

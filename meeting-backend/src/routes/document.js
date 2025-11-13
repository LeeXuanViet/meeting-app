import express from "express"
import { verifyToken, isAdmin } from "../middleware/authMiddleware.js"
import { uploadSingle } from "../middleware/uploadMiddleware.js"
import Document from "../models/Document.js"
import Meeting from "../models/Meeting.js"
import { processDocument } from "../services/documentProcessor.js"
import { generateRAGAnswer } from "../services/ragService.js"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = express.Router()

// Upload document for meeting (only admin)
router.post("/upload", verifyToken, isAdmin, uploadSingle, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Không có file được upload" })
    }

    const { meetingId, roomId } = req.body

    if (!meetingId && !roomId) {
      return res.status(400).json({ message: "Meeting ID hoặc Room ID là bắt buộc" })
    }

    // Find meeting
    let meeting
    if (meetingId) {
      meeting = await Meeting.findById(meetingId)
    } else if (roomId) {
      meeting = await Meeting.findOne({ roomId })
    }

    if (!meeting) {
      return res.status(404).json({ message: "Cuộc họp không tồn tại" })
    }

    // Fix filename encoding - ensure UTF-8
    // Multer sometimes receives filenames in wrong encoding (latin1 instead of utf-8)
    let originalName = req.file.originalname || ""
    try {
      // If filename contains mojibake characters, try to fix encoding
      if (typeof originalName === "string") {
        // Check if it looks like mojibake (contains common mojibake patterns)
        if (/Ã|â|áº|táº|á»/.test(originalName)) {
          console.log(`[Document] Detected potential encoding issue: "${originalName}"`)
          // Try to fix: convert from latin1 misinterpretation back to utf-8
          // This handles cases where UTF-8 bytes were read as latin1
          try {
            const fixed = Buffer.from(originalName, "latin1").toString("utf-8")
            if (fixed && fixed !== originalName && /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/.test(fixed)) {
              console.log(`[Document] Fixed encoding: "${fixed}"`)
              originalName = fixed
            }
          } catch (e) {
            console.warn("[Document] Could not fix encoding, using original")
          }
        }
      }
    } catch (error) {
      console.warn("[Document] Error decoding filename, using original:", error)
    }

    // Create document record
    const document = new Document({
      meetingId: meeting._id,
      roomId: meeting.roomId || roomId,
      uploadedBy: req.user.id,
      fileName: req.file.filename,
      originalName: originalName,
      filePath: req.file.path,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: "processing",
    })

    await document.save()

    // Process document asynchronously (with file path verification)
    console.log(`[Document] Starting processing for document ${document._id}: ${document.originalName}`)
    console.log(`[Document] File path: ${req.file.path}`)
    
    // Verify file exists before processing
    const fs = (await import("fs")).default
    if (!fs.existsSync(req.file.path)) {
      document.status = "error"
      document.errorMessage = `File not found at path: ${req.file.path}`
      await document.save()
      return res.status(500).json({ message: "File không tồn tại sau khi upload" })
    }

    processDocument(req.file.path, req.file.mimetype)
      .then(async (chunks) => {
        console.log(`[Document] Document ${document._id} processed successfully with ${chunks.length} chunks`)
        document.chunks = chunks
        document.status = "processed"
        document.processedAt = new Date()
        document.chunksProcessed = chunks.length
        await document.save()
        console.log(`[Document] Document ${document._id} saved successfully`)
      })
      .catch(async (error) => {
        console.error(`[Document] Error processing document ${document._id}:`, error)
        document.status = "error"
        document.errorMessage = error.message || "Lỗi không xác định"
        await document.save()
      })

    res.json({
      message: "Tài liệu đã được upload thành công. Đang xử lý...",
      document: {
        id: document._id,
        fileName: document.originalName,
        fileSize: document.fileSize,
        status: document.status,
      },
    })
  } catch (error) {
    console.error("Error uploading document:", error)
    res.status(500).json({ message: error.message || "Lỗi khi upload tài liệu" })
  }
})

// Get documents for meeting
router.get("/meeting/:roomId", verifyToken, async (req, res) => {
  try {
    const { roomId } = req.params

    const documents = await Document.find({ roomId })
      .populate("uploadedBy", "fullName email")
      .sort({ createdAt: -1 })

    res.json(documents)
  } catch (error) {
    console.error("Error fetching documents:", error)
    res.status(500).json({ message: error.message || "Lỗi khi lấy danh sách tài liệu" })
  }
})

// Download document (also support query param token for direct access)
router.get("/download/:id", async (req, res) => {
  try {
    // Support both header token and query param token
    let token = req.headers.authorization?.split(" ")[1] || req.query.token

    if (!token) {
      return res.status(401).json({ message: "Token không được cung cấp" })
    }

    // Verify token
    const jwt = (await import("jsonwebtoken")).default
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const document = await Document.findById(req.params.id)

    if (!document) {
      return res.status(404).json({ message: "Tài liệu không tồn tại" })
    }

    // Check if file exists
    const fs = (await import("fs")).default
    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({ message: "File không tồn tại" })
    }

    // Sanitize filename to avoid encoding issues
    const safeFileName = document.originalName
      .replace(/[^\w\s.-]/g, "_")
      .replace(/\s+/g, "_")
      .substring(0, 200) // Limit length

    // Set headers for download
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodeURIComponent(document.originalName)}`)
    res.setHeader("Content-Type", document.mimeType || "application/octet-stream")

    // Stream file
    fs.createReadStream(document.filePath).pipe(res)
  } catch (error) {
    console.error("Error downloading document:", error)
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token không hợp lệ" })
    }
    res.status(500).json({ message: error.message || "Lỗi khi tải tài liệu" })
  }
})

// Update document (only admin)
router.put("/:id", verifyToken, isAdmin, uploadSingle, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)

    if (!document) {
      return res.status(404).json({ message: "Tài liệu không tồn tại" })
    }

    if (!req.file) {
      return res.status(400).json({ message: "Không có file được upload" })
    }

    // Delete old file
    const fs = (await import("fs")).default
    try {
      if (fs.existsSync(document.filePath)) {
        fs.unlinkSync(document.filePath)
      }
    } catch (err) {
      console.error("Error deleting old file:", err)
    }

    // Fix filename encoding
    let originalName = req.file.originalname || ""
    try {
      if (typeof originalName === "string") {
        if (/Ã|â|áº|táº|á»/.test(originalName)) {
          console.log(`[Document] Detected potential encoding issue: "${originalName}"`)
          try {
            const fixed = Buffer.from(originalName, "latin1").toString("utf-8")
            if (fixed && fixed !== originalName && /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/.test(fixed)) {
              console.log(`[Document] Fixed encoding: "${fixed}"`)
              originalName = fixed
            }
          } catch (e) {
            console.warn("[Document] Could not fix encoding, using original")
          }
        }
      }
    } catch (error) {
      console.warn("[Document] Error decoding filename, using original:", error)
    }

    // Update document
    document.fileName = req.file.filename
    document.originalName = originalName
    document.filePath = req.file.path
    document.fileSize = req.file.size
    document.mimeType = req.file.mimetype
    document.status = "processing"
    document.chunks = []
    document.processedAt = null
    document.chunksProcessed = 0
    document.errorMessage = null

    await document.save()

    // Process document asynchronously
    console.log(`[Document] Starting processing for updated document ${document._id}: ${document.originalName}`)
    
    const fsCheck = (await import("fs")).default
    if (!fsCheck.existsSync(req.file.path)) {
      document.status = "error"
      document.errorMessage = `File not found at path: ${req.file.path}`
      await document.save()
      return res.status(500).json({ message: "File không tồn tại sau khi upload" })
    }

    processDocument(req.file.path, req.file.mimetype)
      .then(async (chunks) => {
        console.log(`[Document] Document ${document._id} processed successfully with ${chunks.length} chunks`)
        document.chunks = chunks
        document.status = "processed"
        document.processedAt = new Date()
        document.chunksProcessed = chunks.length
        await document.save()
        console.log(`[Document] Document ${document._id} saved successfully`)
      })
      .catch(async (error) => {
        console.error(`[Document] Error processing document ${document._id}:`, error)
        document.status = "error"
        document.errorMessage = error.message || "Lỗi không xác định"
        await document.save()
      })

    res.json({
      message: "Tài liệu đã được cập nhật thành công. Đang xử lý...",
      document: {
        id: document._id,
        fileName: document.originalName,
        fileSize: document.fileSize,
        status: document.status,
      },
    })
  } catch (error) {
    console.error("Error updating document:", error)
    res.status(500).json({ message: error.message || "Lỗi khi cập nhật tài liệu" })
  }
})

// Delete document (only admin)
router.delete("/:id", verifyToken, isAdmin, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)

    if (!document) {
      return res.status(404).json({ message: "Tài liệu không tồn tại" })
    }

    // Delete file
    const fs = (await import("fs")).default
    try {
      fs.unlinkSync(document.filePath)
    } catch (err) {
      console.error("Error deleting file:", err)
    }

    await Document.findByIdAndDelete(req.params.id)

    res.json({ message: "Tài liệu đã được xóa thành công" })
  } catch (error) {
    console.error("Error deleting document:", error)
    res.status(500).json({ message: error.message || "Lỗi khi xóa tài liệu" })
  }
})

// RAG Chat - Ask question about documents
router.post("/rag/chat", verifyToken, async (req, res) => {
  try {
    const { roomId, query } = req.body

    if (!roomId || !query) {
      return res.status(400).json({ message: "Room ID và câu hỏi là bắt buộc" })
    }

    // Generate RAG answer
    const result = await generateRAGAnswer(roomId, query)

    res.json({
      query: query,
      answer: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      timestamp: new Date(),
    })
  } catch (error) {
    console.error("Error in RAG chat:", error)
    res.status(500).json({
      message: error.message || "Lỗi khi xử lý câu hỏi",
      answer: "Xin lỗi, có lỗi xảy ra khi xử lý câu hỏi của bạn.",
    })
  }
})

export default router

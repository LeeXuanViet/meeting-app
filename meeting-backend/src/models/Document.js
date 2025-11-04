import mongoose from "mongoose"

const documentSchema = new mongoose.Schema({
  meetingId: { type: mongoose.Schema.Types.ObjectId, ref: "Meeting", required: true },
  roomId: { type: String, required: true }, // For quick lookup
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  filePath: { type: String, required: true },
  fileSize: { type: Number, required: true }, // in bytes
  mimeType: { type: String, required: true },
  status: { type: String, enum: ["processing", "processed", "error"], default: "processing" },
  chunks: [
    {
      text: String,
      chunkIndex: Number,
      embedding: [Number], // Vector embedding
      metadata: {
        page: Number,
        startChar: Number,
        endChar: Number,
      },
    },
  ],
  processedAt: Date,
  errorMessage: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// Index for vector search (if using MongoDB Atlas)
documentSchema.index({ "chunks.embedding": "2dsphere" })
documentSchema.index({ meetingId: 1, status: 1 })

export default mongoose.model("Document", documentSchema)

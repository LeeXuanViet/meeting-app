import OpenAI from "openai"
import Document from "../models/Document.js"
import dotenv from "dotenv"
import { generateEmbeddings } from "./documentProcessor.js"

dotenv.config()

// Lazy initialization of OpenRouter client (compatible with OpenAI SDK)
// OpenRouter provides free API access at https://openrouter.ai
let openai = null
const getOpenAI = () => {
  if (!openai) {
    const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY or OPENAI_API_KEY not configured in .env file. Get your free API key at https://openrouter.ai/settings/keys")
    }
    openai = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1", // OpenRouter API endpoint
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://bkmeeting.soict.io:5000", // Optional: for tracking
        "X-Title": process.env.OPENROUTER_APP_NAME || "Meeting App", // Optional: for tracking
      },
    })
  }
  return openai
}

// Cosine similarity for vector comparison
const cosineSimilarity = (vecA, vecB) => {
  if (vecA.length !== vecB.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Retrieve relevant chunks based on query
export const retrieveRelevantChunks = async (roomId, query, topK = 5) => {
  try {
    console.log(`[RAG] Retrieving chunks for roomId: ${roomId}, query: "${query}"`)

    // Step 1: Get all processed documents for this meeting
    const documents = await Document.find({
      roomId: roomId,
      status: "processed",
    }).populate("uploadedBy", "fullName email")

    console.log(`[RAG] Found ${documents.length} processed documents for room ${roomId}`)

    if (documents.length === 0) {
      // Check if there are any documents at all
      const allDocs = await Document.find({ roomId }).select("status originalName")
      console.log(`[RAG] Total documents in room: ${allDocs.length}`)
      allDocs.forEach((doc) => {
        console.log(`[RAG] - ${doc.originalName}: status=${doc.status}`)
      })
      return []
    }

    // Check if documents have chunks
    let totalChunks = 0
    documents.forEach((doc) => {
      totalChunks += doc.chunks?.length || 0
    })
    console.log(`[RAG] Total chunks across all documents: ${totalChunks}`)

    if (totalChunks === 0) {
      console.log(`[RAG] No chunks found in processed documents`)
      return []
    }

    // Step 2: Convert query to embedding
    console.log(`[RAG] Generating query embedding...`)
    const [queryEmbedding] = await generateEmbeddings([query])
    console.log(`[RAG] Query embedding generated, length: ${queryEmbedding.length}`)

    // Step 3: Calculate similarity for all chunks
    const chunkScores = []

    documents.forEach((doc) => {
      if (!doc.chunks || doc.chunks.length === 0) {
        console.log(`[RAG] Document ${doc.originalName} has no chunks`)
        return
      }

      doc.chunks.forEach((chunk, idx) => {
        if (chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0) {
          const similarity = cosineSimilarity(queryEmbedding, chunk.embedding)
          chunkScores.push({
            chunk: chunk,
            similarity: similarity,
            document: {
              fileName: doc.originalName || doc.fileName,
              uploadedBy: doc.uploadedBy?.fullName || "Unknown",
              uploadedAt: doc.createdAt,
            },
          })
        } else {
          console.log(`[RAG] Chunk ${idx} in ${doc.originalName} has no valid embedding`)
        }
      })
    })

    console.log(`[RAG] Calculated similarity for ${chunkScores.length} chunks`)

    // Step 4: Sort by similarity and return top K
    chunkScores.sort((a, b) => b.similarity - a.similarity)
    const topChunks = chunkScores.slice(0, topK)

    console.log(`[RAG] Returning top ${topChunks.length} chunks`)
    if (topChunks.length > 0) {
      console.log(`[RAG] Top similarity: ${topChunks[0].similarity.toFixed(4)}`)
    }

    return topChunks
  } catch (error) {
    console.error("[RAG] Error retrieving chunks:", error)
    throw error
  }
}

// Generate answer using RAG
export const generateRAGAnswer = async (roomId, query) => {
  try {
    // Step 1: Retrieve relevant chunks
    const relevantChunks = await retrieveRelevantChunks(roomId, query, 5)

    if (relevantChunks.length === 0) {
      return {
        answer: "Xin lỗi, không tìm thấy thông tin liên quan trong các tài liệu đã upload. Vui lòng upload tài liệu hoặc hỏi câu hỏi khác.",
        sources: [],
        confidence: 0,
      }
    }

    // Step 2: Build context from relevant chunks
    const context = relevantChunks
      .map(
        (item, index) =>
          `[Tài liệu ${index + 1}: ${item.document.fileName}]\n${item.chunk.text}`
      )
      .join("\n\n---\n\n")

    // Step 3: Generate answer using GPT with context
    const prompt = `Bạn là một trợ lý AI giúp trả lời câu hỏi dựa trên các tài liệu đã được upload trong cuộc họp.

Các đoạn tài liệu liên quan:
${context}

Câu hỏi của người dùng: ${query}

Yêu cầu:
1. Trả lời câu hỏi dựa trên các đoạn tài liệu trên
2. Nếu không đủ thông tin, nói rõ "Không đủ thông tin trong tài liệu"
3. Trích dẫn nguồn (tên file) khi có thể
4. Trả lời bằng tiếng Việt, ngắn gọn và chính xác

Trả lời:`

    const client = getOpenAI()
    const response = await client.chat.completions.create({
      model: "openai/gpt-3.5-turbo", // OpenRouter model format: provider/model-name
      messages: [
        {
          role: "system",
          content:
            "Bạn là trợ lý AI giúp trả lời câu hỏi dựa trên tài liệu. Trả lời bằng tiếng Việt, ngắn gọn và chính xác.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const answer = response.choices[0].message.content

    // Step 4: Extract sources
    const sources = relevantChunks.map((item) => ({
      fileName: item.document.fileName,
      uploadedBy: item.document.uploadedBy,
      similarity: item.similarity,
      text: (item.chunk.text || "").substring(0, 200) + "...", // Preview
    }))

    return {
      answer: answer,
      sources: sources,
      confidence: relevantChunks[0]?.similarity || 0,
    }
  } catch (error) {
    console.error("Error generating RAG answer:", error)
    throw error
  }
}

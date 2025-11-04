import fs from "fs/promises"
import mammoth from "mammoth"
import OpenAI from "openai"
import dotenv from "dotenv"

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
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "http://localhost:5000", // Optional: for tracking
        "X-Title": process.env.OPENROUTER_APP_NAME || "Meeting App", // Optional: for tracking
      },
    })
  }
  return openai
}

// Dynamic import for pdf-parse to avoid ESM issue with test files
let pdfParse = null
let pdfParseLoading = false
const loadPdfParse = async () => {
  if (pdfParse) return pdfParse
  if (pdfParseLoading) {
    // Wait if already loading
    while (pdfParseLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return pdfParse
  }

  pdfParseLoading = true
  try {
    // Create test file before importing to avoid ENOENT error
    // pdf-parse tries to read a test file on module load
    const fs = await import("fs/promises")
    const path = await import("path")
    const { fileURLToPath } = await import("url")
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    
    const testDir = path.join(__dirname, "../../node_modules/pdf-parse/test/data")
    const testFile = path.join(testDir, "05-versions-space.pdf")
    
    try {
      await fs.mkdir(testDir, { recursive: true })
      // Create an empty dummy file if it doesn't exist
      try {
        await fs.access(testFile)
      } catch {
        await fs.writeFile(testFile, Buffer.alloc(0))
      }
    } catch (err) {
      // Ignore errors, try to continue anyway
      console.warn("[DocumentProcessor] Could not create pdf-parse test file:", err.message)
    }
    
    // Use dynamic import with error handling
    const pdfParseModule = await import("pdf-parse").catch((err) => {
      console.error("[DocumentProcessor] Error importing pdf-parse:", err)
      throw new Error("Failed to load PDF parser")
    })
    pdfParse = pdfParseModule.default || pdfParseModule
  } finally {
    pdfParseLoading = false
  }
  return pdfParse
}

// Chunk text into smaller pieces for embedding
export const chunkText = (text, chunkSize = 500, overlap = 50, maxChunks = 500) => {
  const chunks = []
  let start = 0

  while (start < text.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, text.length)
    const chunk = text.slice(start, end).trim()

    if (chunk.length > 0) {
      chunks.push({
        text: chunk,
        startChar: start,
        endChar: end,
      })
    }

    // Move forward with overlap
    start = end - overlap
  }

  // Log warning if text was truncated
  if (start < text.length) {
    console.warn(`[DocumentProcessor] Text truncated: ${text.length} chars -> ${chunks.length} chunks (max ${maxChunks})`)
  }

  return chunks
}

// Extract text from different file types
export const extractText = async (filePath, mimeType) => {
  try {
    if (mimeType === "application/pdf") {
      // Verify file exists first
      try {
        await fs.access(filePath)
      } catch (error) {
        throw new Error(`PDF file not found: ${filePath}`)
      }

      const pdfParseLib = await loadPdfParse()
      const dataBuffer = await fs.readFile(filePath)
      const data = await pdfParseLib(dataBuffer)
      return data.text || ""
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value
    } else if (mimeType === "text/plain" || mimeType.includes("text/")) {
      const data = await fs.readFile(filePath, "utf-8")
      return data
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`)
    }
  } catch (error) {
    console.error("Error extracting text:", error)
    throw error
  }
}

// Generate embeddings using OpenAI (with batching to avoid memory issues)
export const generateEmbeddings = async (texts, batchSize = 100) => {
  try {
    const client = getOpenAI()
    const allEmbeddings = []

    // Process in batches to avoid memory issues
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize)
      console.log(`[DocumentProcessor] Generating embeddings for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} chunks)...`)
      
      const response = await client.embeddings.create({
        model: "openai/text-embedding-3-small", // OpenRouter model format: provider/model-name
        input: batch,
      })

      allEmbeddings.push(...response.data.map((item) => item.embedding))
      
      // Small delay to avoid rate limiting
      if (i + batchSize < texts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    return allEmbeddings
  } catch (error) {
    console.error("Error generating embeddings:", error)
    throw error
  }
}

// Process document: extract -> chunk -> embed
export const processDocument = async (filePath, mimeType) => {
  try {
    // Step 1: Extract text
    console.log("Extracting text from document...")
    const fullText = await extractText(filePath, mimeType)

    if (!fullText || fullText.trim().length === 0) {
      throw new Error("No text extracted from document")
    }

    // Step 2: Chunk text (with limits to avoid memory issues)
    console.log(`[DocumentProcessor] Chunking text (${fullText.length} chars)...`)
    // Limit text length to ~250KB to avoid memory issues (500 chunks * 500 chars)
    const maxTextLength = 250000
    const textToProcess = fullText.length > maxTextLength 
      ? fullText.substring(0, maxTextLength) 
      : fullText
      
    if (fullText.length > maxTextLength) {
      console.warn(`[DocumentProcessor] Document text truncated from ${fullText.length} to ${maxTextLength} chars to avoid memory issues`)
    }
    
    const textChunks = chunkText(textToProcess, 500, 50, 500) // Max 500 chunks
    console.log(`[DocumentProcessor] Created ${textChunks.length} chunks`)

    if (textChunks.length === 0) {
      throw new Error("No chunks created from document")
    }

    // Step 3: Generate embeddings in batches to avoid memory issues
    console.log(`[DocumentProcessor] Generating embeddings for ${textChunks.length} chunks (in batches)...`)
    const chunkTexts = textChunks.map((chunk) => chunk.text)
    
    // Limit chunk text length to avoid token limits (embedding model has token limits)
    const limitedChunkTexts = chunkTexts.map((text) => {
      // Limit to ~8000 characters (roughly 2000 tokens for embedding model)
      if (text.length > 8000) {
        return text.substring(0, 8000)
      }
      return text
    })
    
    const embeddings = await generateEmbeddings(limitedChunkTexts, 50) // Smaller batch size: 50

    // Step 4: Combine chunks with embeddings
    const processedChunks = textChunks.map((chunk, index) => {
      const embedding = embeddings[index]
      if (!embedding || embedding.length === 0) {
        console.warn(`[DocumentProcessor] Chunk ${index} has no embedding`)
      }
      return {
        text: chunk.text,
        chunkIndex: index,
        embedding: embedding || [],
        metadata: {
          page: 1, // PDF parsing would provide page numbers
          startChar: chunk.startChar,
          endChar: chunk.endChar,
        },
      }
    })

    console.log(`[DocumentProcessor] Processed ${processedChunks.length} chunks with embeddings`)
    return processedChunks
  } catch (error) {
    console.error("Error processing document:", error)
    throw error
  }
}

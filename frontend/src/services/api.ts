interface ResponseMeta {
  chunks: number
  latencyMs: number
  model?: string
}
interface UploadReply {
  documents: Document[]
  message: string
}
interface ConversationTurn {
  role: "user" | "ai"
  text: string
}
export interface Document {
  id: string
  name: string
  pages: number
  size: number
  publisher: string
  category: string
  sourceUrl: string
  note: string
  chunks: number
  status: string
}
export interface Source {
  number: number
  docId: string
  docName: string
  page: number
  snippet: string
  similarity: number
  publisher: string
  sourceUrl: string
  note: string
}
export interface Health {
  status: string
  ollama: string
  model: string
  documents: number
  chunks: number
  error: string | null
}
export interface Reply {
  answer: string
  sources: Source[]
  mode: string
  table?: {
    headers: string[]
    rows: string[][]
    pages: number[]
    docId: string
    docName: string
  }
  meta: ResponseMeta
}
const BASE = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "")
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    throw new Error(
      typeof detail === "string"
        ? detail
        : `Request failed (${response.status}). Check the backend connection.`,
    )
  }
  return response.json()
}
export const getDocuments = () => request<Document[]>("/documents")
export const getHealth = () => request<Health>("/health")
export const documentUrl = (id: string, page = 1) =>
  `${BASE}/documents/${encodeURIComponent(id)}/file#page=${page}`
export const deleteDocument = (id: string) =>
  request(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" })
export const ingestPdfs = (body: FormData) =>
  request<UploadReply>("/ingest_pdfs/", {
    method: "POST",
    body,
  })
export const queryBot = (
  question: string,
  language: "EN" | "HI",
  doc_id: string | undefined,
  history: ConversationTurn[],
  signal: AbortSignal,
) =>
  request<Reply>("/query/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      language,
      doc_id,
      history: history
        .slice(-6)
        .map((m) => ({ ...m, text: m.text.slice(0, 3000) })),
    }),
    signal,
  })

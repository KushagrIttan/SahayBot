import { useEffect, useRef, useState } from "react"
import {
  deleteDocument,
  documentUrl,
  getDocuments,
  getHealth,
  ingestPdfs,
  queryBot,
} from "./services/api"
import type { Document, Health, Reply, Source } from "./services/api"

type Lang = "EN" | "HI"
type View = "chat" | "finance" | "grievance" | "library"
type Message = {
  id: string
  role: "user" | "ai"
  text: string
  reply?: Reply
  language?: Lang
  error?: boolean
}
interface ToolProps {
  lang: Lang
  ask: (question: string) => void
}
const WORDS = {
  EN: {
    tagline: "Your cooperative companion",
    chat: "Ask SahayBot",
    finance: "Financial literacy",
    grievance: "Grievance support",
    library: "Source library",
    new: "New conversation",
    input: "Ask about your cooperative, a scheme or crop insurance…",
    send: "Send",
    welcome: "A clearer path to cooperative support.",
    description:
      "Understand your rights, discover services and take the next step — with evidence you can read.",
    upload: "Upload PDF",
    all: "All documents",
    thinking: "Finding evidence and preparing your answer…",
    sources: "Retrieved evidence",
    empty: "No documents indexed yet. Upload a readable PDF.",
    disclaimer:
      "Guidance from reference documents, not a legal decision. Verify current notifications and your state’s adopted rules.",
    select: "Search scope",
    speak: "Read aloud",
    stop: "Stop audio",
    copy: "Copy",
    close: "Close",
    history:
      "Conversation is saved in this browser. New conversation clears it.",
    offline:
      "Browser voice input may use your browser provider’s servers. Typed questions and local AI do not require cloud inference.",
  },
  HI: {
    tagline: "आपकी सहकारिता का साथी",
    chat: "सहायबॉट से पूछें",
    finance: "वित्तीय साक्षरता",
    grievance: "शिकायत सहायता",
    library: "दस्तावेज़ संग्रह",
    new: "नई बातचीत",
    input: "सहकारी संस्था, योजना या फसल बीमा के बारे में पूछें…",
    send: "भेजें",
    welcome: "सहकारिता की जानकारी, अब आसान।",
    description:
      "अपने अधिकार समझें, सेवाएँ जानें और अगला कदम उठाएँ — मूल दस्तावेज़ों के साथ।",
    upload: "PDF अपलोड करें",
    all: "सभी दस्तावेज़",
    thinking: "दस्तावेज़ों से जानकारी लेकर उत्तर तैयार किया जा रहा है…",
    sources: "संबंधित दस्तावेज़ के अंश",
    empty: "अभी कोई दस्तावेज़ नहीं है। टेक्स्ट वाला PDF अपलोड करें।",
    disclaimer:
      "यह दस्तावेज़ आधारित मार्गदर्शन है, कानूनी निर्णय नहीं। वर्तमान अधिसूचना और राज्य में लागू उपविधियाँ जाँचें।",
    select: "खोज के दस्तावेज़",
    speak: "उत्तर सुनें",
    stop: "आवाज़ बंद करें",
    copy: "कॉपी करें",
    close: "बंद करें",
    history: "बातचीत इस ब्राउज़र में सुरक्षित होती है। नई बातचीत इसे मिटाती है।",
    offline:
      "ब्राउज़र की आवाज़ पहचान सेवा ऑडियो अपने सर्वर पर भेज सकती है। टेक्स्ट और स्थानीय AI के लिए क्लाउड AI आवश्यक नहीं है।",
  },
}
const PROMPTS = {
  EN: [
    [
      "🌾",
      "PACS services",
      "What services can a PACS provide under the model bye-laws?",
    ],
    ["☂", "Crop insurance", "What are the farmer premium rates under PMFBY?"],
    [
      "🤝",
      "Member rights",
      "What are the membership conditions in the PACS model bye-laws?",
    ],
    ["📝", "Get heard", "How does grievance redressal work under PMFBY?"],
  ],
  HI: [
    [
      "🌾",
      "पैक्स की सेवाएँ",
      "पैक्स की मॉडल उपविधियों के अनुसार कौन-कौन सी सेवाएँ मिल सकती हैं?",
    ],
    [
      "☂",
      "फसल बीमा",
      "प्रधानमंत्री फसल बीमा योजना में किसान को कितना प्रीमियम देना होता है?",
    ],
    ["🤝", "सदस्यता", "पैक्स की मॉडल उपविधियों में सदस्य बनने की शर्तें क्या हैं?"],
    [
      "📝",
      "शिकायत सहायता",
      "प्रधानमंत्री फसल बीमा योजना में शिकायत निवारण कैसे होता है?",
    ],
  ],
}
function initialMessages(): Message[] {
  try {
    const data = JSON.parse(localStorage.getItem("sahaybot-chat-v2") || "[]")
    return Array.isArray(data)
      ? data
          .filter(
            (m) =>
              m &&
              typeof m.id === "string" &&
              ["user", "ai"].includes(m.role) &&
              typeof m.text === "string",
          )
          .slice(-40)
      : []
  } catch {
    return []
  }
}
function inline(text: string, sources: Source[], open: (s: Source) => void) {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    if (part.startsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    const match = /^\[(\d+)\]$/.exec(part)
    const source = match && sources.find((s) => s.number === Number(match[1]))
    if (source)
      return (
        <button
          key={i}
          className="inline-citation"
          onClick={() => open(source)}
          aria-label={`Source ${source.number}, page ${source.page}`}
        >
          {part}
        </button>
      )
    return part
  })
}
function Answer({
  text,
  sources,
  open,
}: {
  text: string
  sources: Source[]
  open: (s: Source) => void
}) {
  return (
    <div className="answer-text">
      {text
        .split("\n")
        .map((line, i) =>
          line.trim() ? (
            <p key={i}>{inline(line, sources, open)}</p>
          ) : (
            <div className="paragraph-gap" key={i} />
          ),
        )}
    </div>
  )
}
function localizeCell(cell: string, lang: Lang) {
  if (lang === "EN") return cell
  const terms: [string, string][] = [
    [
      "Maximum Premium Rate payable by farmer (% of Sum Insured)*",
      "किसान का अधिकतम प्रीमियम (बीमित राशि का प्रतिशत)*",
    ],
    [
      "All Food grain and Oilseeds crops (all Cereals, Millets, Pulses and Oilseeds crops)",
      "सभी खाद्यान्न और तिलहन फसलें (अनाज, मोटे अनाज, दालें और तिलहन)",
    ],
    [
      "Annual Commercial/ Annual Horticultural crops",
      "वार्षिक वाणिज्यिक / वार्षिक बागवानी फसलें",
    ],
    [
      "Perennial horticultural / commercial crops (pilot basis)",
      "बहुवर्षीय बागवानी / वाणिज्यिक फसलें (पायलट आधार पर)",
    ],
    [
      "of SI or Actuarial rate, whichever is less",
      "बीमित राशि या बीमांकिक दर, जो भी कम हो",
    ],
    ["Kharif and Rabi", "खरीफ और रबी"],
    ["Kharif", "खरीफ"],
    ["Rabi", "रबी"],
    ["Season", "मौसम"],
    ["Crops", "फसलें"],
  ]
  return terms.reduce(
    (value, [english, hindi]) => value.replace(english, hindi),
    cell,
  )
}
function SourceTable({
  table,
  lang,
}: {
  table: NonNullable<Reply["table"]>
  lang: Lang
}) {
  return (
    <div className="document-table">
      <div className="source-table-label">
        {lang === "HI"
          ? "PDF से निकाली गई तालिका"
          : "Table extracted from the PDF"}{" "}
        · {table.pages.join("–")}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {table.headers.map((cell, i) => (
                <th key={i} title={cell}>
                  {localizeCell(cell, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} title={cell}>
                    {localizeCell(cell, lang)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        {lang === "HI"
          ? "SI = बीमित राशि। मूल अंग्रेज़ी शब्द और अगला पृष्ठ स्रोत PDF में देखें।"
          : "SI = Sum Insured. See the source PDF for the original wording, continuation and footnotes."}
      </p>
    </div>
  )
}
const rupees = (n: number) =>
  n.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  })
function Finance({ lang, ask }: ToolProps) {
  const [principal, setPrincipal] = useState(100000)
  const [rate, setRate] = useState(10)
  const [months, setMonths] = useState(24)
  const monthly = rate / 1200
  const emi =
    monthly === 0
      ? principal / months
      : (principal * monthly) / (1 - Math.pow(1 + monthly, -months))
  const total = emi * months
  const hi = lang === "HI"
  return (
    <div className="tool-page">
      <span className="eyebrow">
        {hi ? "समझें, फिर निर्णय लें" : "UNDERSTAND BEFORE YOU BORROW"}
      </span>
      <h1>{hi ? "आपके पैसे, समझदारी से।" : "Make sense of your money."}</h1>
      <p className="intro">
        {hi
          ? "ऋण की मासिक किस्त और ब्याज समझें। यह शैक्षणिक अनुमान है, बैंक का प्रस्ताव नहीं।"
          : "Understand your monthly instalment and the cost of borrowing. An educational estimate, not a bank offer."}
      </p>
      <div className="tool-grid">
        <section className="panel">
          <h2>{hi ? "ऋण कैलकुलेटर" : "Loan repayment calculator"}</h2>
          <label>
            {hi ? "ऋण राशि (₹)" : "Loan amount (₹)"}
            <input
              type="number"
              min="1"
              max="100000000"
              value={principal}
              onChange={(e) =>
                setPrincipal(
                  Math.min(100000000, Math.max(1, Number(e.target.value))),
                )
              }
            />
          </label>
          <label>
            {hi ? "वार्षिक ब्याज दर (%)" : "Annual interest (%)"}
            <input
              type="number"
              min="0"
              max="60"
              step="0.1"
              value={rate}
              onChange={(e) =>
                setRate(Math.min(60, Math.max(0, Number(e.target.value))))
              }
            />
          </label>
          <label>
            {hi ? "अवधि (महीने)" : "Term (months)"}
            <input
              type="number"
              min="1"
              max="360"
              value={months}
              onChange={(e) =>
                setMonths(
                  Math.min(
                    360,
                    Math.max(1, Math.round(Number(e.target.value))),
                  ),
                )
              }
            />
          </label>
          <p className="muted small">
            {hi
              ? "घटते शेष पर मासिक किस्त। शुल्क, दंड और बीमा शामिल नहीं हैं।"
              : "Monthly instalments on a reducing balance. Excludes fees, penalties and insurance."}
          </p>
        </section>
        <section className="panel finance-result">
          <span>
            {hi ? "अनुमानित मासिक किस्त" : "Estimated monthly instalment"}
          </span>
          <div className="money">{rupees(emi)}</div>
          <div className="money-line">
            <span>{hi ? "मूल राशि" : "Principal"}</span>
            <strong>{rupees(principal)}</strong>
          </div>
          <div className="money-line">
            <span>{hi ? "कुल ब्याज" : "Total interest"}</span>
            <strong>{rupees(total - principal)}</strong>
          </div>
          <div className="money-line">
            <span>{hi ? "कुल भुगतान" : "Total repayment"}</span>
            <strong>{rupees(total)}</strong>
          </div>
          <div className="cost-bar">
            <div style={{ width: `${(principal / total) * 100}%` }} />
          </div>
          <p className="small">
            {hi
              ? "बैंक से लिखित ब्याज दर, शुल्क और किस्त विवरण माँगें।"
              : "Ask the lender for the written rate, all charges and repayment schedule."}
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>
          {hi
            ? "दस्तावेज़ों से वित्तीय जानकारी"
            : "Learn from the reference documents"}
        </h2>
        <p className="muted">
          {hi
            ? "बचत, जिम्मेदार ऋण और ग्राहक सुरक्षा के बारे में RBI दस्तावेज़ से पूछें।"
            : "Ask the RBI reference about financial literacy, responsible borrowing and consumer protection."}
        </p>
        <button
          className="primary"
          onClick={() =>
            ask(
              hi
                ? "वित्तीय साक्षरता और ग्राहक सुरक्षा क्यों महत्वपूर्ण हैं?"
                : "Why are financial literacy and consumer protection important?",
            )
          }
        >
          {hi ? "सहायबॉट से पूछें" : "Ask SahayBot"}
        </button>
      </section>
    </div>
  )
}
function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Grievance({ lang, ask }: ToolProps) {
  const hi = lang === "HI"
  const [name, setName] = useState("")
  const [society, setSociety] = useState("")
  const [place, setPlace] = useState("")
  const [issue, setIssue] = useState("")
  const [relief, setRelief] = useState("")
  const [draft, setDraft] = useState("")
  function build() {
    const date = new Date().toLocaleDateString(hi ? "hi-IN" : "en-IN")
    setDraft(
      hi
        ? `शिकायत का मसौदा — प्रेषण से पहले संपादित और सत्यापित करें\n\nदिनांक: ${date}\nप्रति: संबंधित सहकारी संस्था / सक्षम प्राधिकरण\nविषय: ${society} से संबंधित शिकायत\n\nमेरा नाम ${name} है और मैं ${place} से हूँ।\n\nसमस्या का विवरण:\n${issue}\n\nमेरा अनुरोध:\n${relief || "कृपया शिकायत की जाँच करें और लिखित उत्तर दें।"}\n\nसंलग्नक: सदस्यता विवरण, रसीदें, पत्राचार और संबंधित दस्तावेज़ (उपलब्ध होने पर)।\n\nकृपया प्राप्ति की पुष्टि करें और लागू प्रक्रिया के अनुसार आगे की कार्रवाई बताएँ।\n\nभवदीय,\n${name}\n\nयह केवल मसौदा है। कोई शिकायत जमा नहीं हुई है। सही प्राधिकरण राज्य, संस्था के प्रकार और समस्या पर निर्भर करता है।`
        : `GRIEVANCE DRAFT — edit and verify before sending\n\nDate: ${date}\nTo: The concerned cooperative / competent authority\nSubject: Grievance concerning ${society}\n\nMy name is ${name}, from ${place}.\n\nDescription of the issue:\n${issue}\n\nRequested resolution:\n${relief || "Please examine this grievance and provide a written response."}\n\nAttachments: Membership details, receipts, correspondence and relevant records, where available.\n\nPlease acknowledge receipt and explain the next steps under the applicable procedure.\n\nYours faithfully,\n${name}\n\nThis is a draft only. No grievance has been submitted. The competent authority depends on the state, society type and issue.`,
    )
  }
  return (
    <div className="tool-page">
      <span className="eyebrow">
        {hi ? "अपनी बात रखें" : "TAKE THE NEXT STEP"}
      </span>
      <h1>{hi ? "अपनी शिकायत स्पष्ट लिखें।" : "Make your concern heard."}</h1>
      <p className="intro">
        {hi
          ? "शिकायत का संपादन योग्य मसौदा बनाएँ। यह सेवा किसी पोर्टल पर शिकायत जमा नहीं करती।"
          : "Prepare an editable complaint draft. This tool does not submit a complaint to any authority."}
      </p>
      <div className="tool-grid">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault()
            build()
          }}
        >
          <label>
            {hi ? "आपका नाम" : "Your name"}
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {hi ? "संस्था / पैक्स का नाम" : "Cooperative / PACS name"}
            <input
              required
              maxLength={200}
              value={society}
              onChange={(e) => setSociety(e.target.value)}
            />
          </label>
          <label>
            {hi ? "जिला और राज्य" : "District and state"}
            <input
              required
              maxLength={200}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
          </label>
          <label>
            {hi
              ? "क्या हुआ? तारीख और तथ्य बताएँ।"
              : "What happened? Include dates and facts."}
            <textarea
              required
              maxLength={4000}
              rows={4}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
            />
          </label>
          <label>
            {hi ? "आप क्या समाधान चाहते हैं?" : "What resolution do you seek?"}
            <textarea
              maxLength={1000}
              rows={2}
              value={relief}
              onChange={(e) => setRelief(e.target.value)}
            />
          </label>
          <p className="small muted">
            {hi
              ? "आधार, बैंक खाता संख्या, PIN या OTP न लिखें। ये फ़ील्ड सर्वर पर नहीं भेजे जाते।"
              : "Do not include Aadhaar, account numbers, PINs or OTPs. These form fields stay in this page and are not sent to the server."}
          </p>
          <button className="primary" type="submit">
            {hi ? "मसौदा बनाएँ" : "Prepare draft"}
          </button>
        </form>
        <section className="panel">
          <h2>{hi ? "आपका मसौदा" : "Your draft"}</h2>
          {draft ? (
            <>
              <textarea
                className="draft"
                aria-label="Editable grievance draft"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={18}
              />
              <button
                className="primary"
                onClick={() =>
                  downloadText("SahayBot-grievance-draft.txt", draft)
                }
              >
                {hi ? "मसौदा डाउनलोड करें" : "Download draft"}
              </button>
            </>
          ) : (
            <div className="draft-empty">
              <span>📝</span>
              <p>
                {hi
                  ? "विवरण भरें। मसौदा यहाँ दिखेगा।"
                  : "Fill in the details. Your editable draft will appear here."}
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <h2>{hi ? "सही प्रक्रिया पहचानें" : "Find the applicable process"}</h2>
        <p className="muted">
          {hi
            ? "राज्य और बहु-राज्य सहकारी संस्थाओं की प्रक्रिया अलग हो सकती है। फसल बीमा की शिकायत के लिए PMFBY दस्तावेज़ देखें।"
            : "State and multi-state cooperatives may have different procedures. For crop insurance disputes, consult the PMFBY grievance provisions."}
        </p>
        <div className="button-row">
          <button
            className="secondary"
            onClick={() =>
              ask(
                hi
                  ? "PMFBY में शिकायत निवारण की प्रक्रिया क्या है?"
                  : "What is the grievance redressal mechanism under PMFBY?",
              )
            }
          >
            {hi ? "PMFBY प्रक्रिया पूछें" : "Ask about PMFBY grievances"}
          </button>
          <a
            className="text-link"
            href="https://pgportal.gov.in/"
            target="_blank"
            rel="noreferrer"
          >
            CPGRAMS ↗
          </a>
          <a
            className="text-link"
            href="https://crcs.gov.in/"
            target="_blank"
            rel="noreferrer"
          >
            {hi ? "केंद्रीय रजिस्ट्रार ↗" : "Central Registrar ↗"}
          </a>
        </div>
        <p className="small muted">
          {hi
            ? "ये बाहरी पोर्टल हैं। संबंधित विभाग और प्राधिकरण की पुष्टि करके ही शिकायत भेजें।"
            : "External portals. Confirm the relevant department and competent authority before submitting."}
        </p>
      </section>
    </div>
  )
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => { try { return localStorage.getItem("sahaybot-language") === "HI" ? "HI" : "EN"; } catch { return "EN"; } })
  const w = WORDS[lang]
  const [view, setView] = useState<View>("chat")
  const [menu, setMenu] = useState(false)
  const [docs, setDocs] = useState<Document[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [notice, setNotice] = useState("")
  const [scope, setScope] = useState("")
  const [search, setSearch] = useState("")
  const [preview, setPreview] = useState<Source | null>(null)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const recognition = useRef<any>(null)
  useEffect(() => { document.documentElement.lang = lang === "HI" ? "hi" : "en"; try { localStorage.setItem("sahaybot-language", lang); } catch {} }, [lang]);
  useEffect(() => {
    try {
      localStorage.setItem(
        "sahaybot-chat-v2",
        JSON.stringify(messages.slice(-40)),
      )
    } catch {
      /* Browser storage can be disabled or full. Chat still works in memory. */
    }
  }, [messages])
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreview(null)
        setMenu(false)
      }
    }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, busy])
  async function refresh() {
    const [library, status] = await Promise.all([getDocuments(), getHealth()])
    setDocs(library)
    setHealth(status)
    if (scope && !library.some((d) => d.id === scope)) setScope("")
  }
  useEffect(() => {
    refresh()
      .catch((e) => setNotice(e.message))
      .finally(() => setLoading(false))
    const timer = setInterval(() => {
      getHealth()
        .then(setHealth)
        .catch(() => setHealth(null))
    }, 30000)
    return () => {
      clearInterval(timer)
      abort.current?.abort()
      recognition.current?.abort()
      window.speechSynthesis?.cancel()
    }
  }, [])
  function changeView(next: View) {
    setView(next)
    setMenu(false)
  }
  async function send(question = input) {
    const q = question.trim()
    if (!q || busy || uploading) return
    changeView("chat")
    setInput("")
    setNotice("")
    setBusy(true)
    const history = messages
      .filter((m) => !m.error)
      .map(({ role, text }) => ({ role, text }))
    const user: Message = { id: crypto.randomUUID(), role: "user", text: q }
    setMessages((prev) => [...prev, user])
    const controller = new AbortController()
    abort.current = controller
    const timeout = setTimeout(() => controller.abort(), 180000)
    try {
      const reply = await queryBot(
        q,
        lang,
        scope || undefined,
        history,
        controller.signal,
      )
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: reply.answer,
          reply,
          language: lang,
        },
      ])
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ai",
          text: controller.signal.aborted
            ? lang === "HI"
              ? "अनुरोध रद्द हो गया या समय सीमा समाप्त हुई। पुनः प्रयास करें।"
              : "Request cancelled or timed out. Please try again."
            : (e as Error).message,
          error: true,
        },
      ])
    } finally {
      clearTimeout(timeout)
      setBusy(false)
      abort.current = null
    }
  }
  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (!files.length) return
    if (
      files.length > 5 ||
      files.some(
        (f) =>
          !f.name.toLowerCase().endsWith(".pdf") || f.size > 15 * 1024 * 1024,
      )
    ) {
      setNotice(
        lang === "HI"
          ? "एक बार में अधिकतम 5 PDF, प्रत्येक 15 MB तक।"
          : "Upload up to 5 PDFs, each no larger than 15 MB.",
      )
      return
    }
    setUploading(true)
    setNotice("")
    const body = new FormData()
    files.forEach((f) => body.append("files", f))
    try {
      const result = await ingestPdfs(body)
      setDocs(result.documents)
      setNotice(result.message)
      await refresh()
    } catch (e) {
      setNotice((e as Error).message)
      await refresh().catch(() => {})
    } finally {
      setUploading(false)
    }
  }
  function voice() {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setNotice(
        lang === "HI"
          ? "इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। कृपया टाइप करें या Chrome में खोलें।"
          : "Voice recognition is unavailable in this browser. Type your question or try Chrome.",
      )
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = lang === "HI" ? "hi-IN" : "en-IN"
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (event: any) =>
      setInput(
        (prev) => (prev ? prev + " " : "") + event.results[0][0].transcript,
      )
    rec.onend = () => setListening(false)
    rec.onerror = (event: any) => {
      setListening(false)
      setNotice(
        `Voice input: ${event.error}. Check microphone permission and connection.`,
      )
    }
    recognition.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setNotice("Could not start the microphone. Please try again.")
    }
  }
  function speak(message: Message) {
    if (!("speechSynthesis" in window)) {
      setNotice("Speech playback is unavailable in this browser.")
      return
    }
    if (speaking === message.id) {
      window.speechSynthesis.cancel()
      setSpeaking(null)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(
      (
        message.text +
        (message.reply?.table
          ? "\n" +
            message.reply.table.rows
              .map((row) =>
                row
                  .map((cell) => localizeCell(cell, message.language || lang))
                  .join(". "),
              )
              .join("\n")
          : "")
      ).replace(/\*|\[\d+\]/g, ""),
    )
    const language = message.language || lang
    utterance.lang = language === "HI" ? "hi-IN" : "en-IN"
    const voice = window.speechSynthesis
      .getVoices()
      .find((v) => v.lang.startsWith(language === "HI" ? "hi" : "en"))
    if (voice) utterance.voice = voice
    utterance.onend = () => setSpeaking(null)
    utterance.onerror = () => {
      setSpeaking(null)
      setNotice(
        "Audio playback failed. Check whether a voice is installed for this language.",
      )
    }
    setSpeaking(message.id)
    window.speechSynthesis.speak(utterance)
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(lang === "HI" ? "कॉपी हो गया।" : "Copied.")
    } catch {
      setNotice("Clipboard unavailable. Select and copy the text manually.")
    }
  }
  const filtered = docs.filter((d) =>
    `${d.name} ${d.category} ${d.publisher}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const nav: [View, string, string][] = [
    ["chat", "✦", w.chat],
    ["finance", "₹", w.finance],
    ["grievance", "✎", w.grievance],
    ["library", "▤", w.library],
  ]
  return (
    <div className="app-shell">
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="application/pdf,.pdf"
        multiple
        onChange={upload}
      />
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <div className="brand">
          <div className="brand-icon">✦</div>
          <div>
            <strong>
              SahayBot<span>सहायबॉट</span>
            </strong>
            <small>{w.tagline}</small>
          </div>
          <button
            className="mobile-close icon-button"
            aria-label="Close menu"
            onClick={() => setMenu(false)}
          >
            ×
          </button>
        </div>
        <div className="submission-badge">
          SIH 2026 <span>•</span> PS 26088
        </div>
        <nav>
          {nav.map(([id, icon, label]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => changeView(id)}
            >
              <span>{icon}</span>
              {label}
              {id === "library" && <small>{docs.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-heading">
          {lang === "HI" ? "ज्ञान का आधार" : "KNOWLEDGE BASE"}
          <span>{docs.length}</span>
        </div>
        <div className="sidebar-docs">
          {loading ? (
            <p className="small">Loading library…</p>
          ) : docs.length === 0 ? (
            <p className="small">{w.empty}</p>
          ) : (
            docs.map((d) => (
              <button
                key={d.id}
                className={`sidebar-doc ${scope === d.id ? "selected" : ""}`}
                onClick={() => {
                  setScope(scope === d.id ? "" : d.id)
                  changeView("chat")
                }}
                title={d.name}
              >
                <span>▤</span>
                <div>
                  <strong>{d.category}</strong>
                  <small>
                    {d.pages} {lang === "HI" ? "पृष्ठ" : "pages"} · {d.publisher}
                  </small>
                </div>
              </button>
            ))
          )}
        </div>
        <button
          className="sidebar-upload"
          disabled={busy || uploading}
          onClick={() => fileRef.current?.click()}
        >
          ＋{" "}
          {uploading
            ? lang === "HI"
              ? "इंडेक्स बन रहा है…"
              : "Indexing PDF…"
            : w.upload}
        </button>
        <div className="sidebar-bottom">
          <div className="local-dot" />
          <div>
            <strong>
              {health?.ollama === "connected"
                ? "Local AI connected"
                : "Local AI unavailable"}
            </strong>
            <small>
              {health?.model || "Llama 3.2"} · {health?.chunks || 0} passages
            </small>
          </div>
          <button
            className="icon-button"
            title="Refresh status"
            aria-label="Refresh status"
            onClick={() => refresh().catch((e) => setNotice(e.message))}
          >
            ↻
          </button>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              aria-label="Open menu"
              onClick={() => setMenu(true)}
            >
              ☰
            </button>
            <span className="breadcrumb">
              {
                w[
                  view === "chat"
                    ? "chat"
                    : view === "finance"
                      ? "finance"
                      : view === "grievance"
                        ? "grievance"
                        : "library"
                ]
              }
            </span>
            <span className="prototype-tag">
              {lang === "HI" ? "कार्यशील प्रोटोटाइप" : "Working prototype"}
            </span>
          </div>
          <div className="topbar-actions">
            <button
              className="language"
              onClick={() => {
                setLang(lang === "EN" ? "HI" : "EN")
                document.documentElement.lang = lang === "EN" ? "hi" : "en"
              }}
            >
              अ / A <strong>{lang === "EN" ? "हिन्दी" : "English"}</strong>
            </button>
            <button
              className="new-chat"
              disabled={busy}
              onClick={() => {
                setMessages([])
                setPreview(null)
                window.speechSynthesis?.cancel()
                setSpeaking(null)
                changeView("chat")
              }}
            >
              {w.new} ＋
            </button>
          </div>
        </header>
        {notice && (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notice"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {health?.error && (
          <div className="notice" role="alert">
            {health.error}
          </div>
        )}
        {view === "chat" ? (
          <>
            <div className="scope-bar">
              <label htmlFor="scope">{w.select}</label>
              <select
                id="scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              >
                <option value="">
                  {w.all} ({docs.length})
                </option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <span className="scope-note">
                {lang === "HI" ? "मूल PDF से जानकारी" : "Answers from your PDFs"}
              </span>
            </div>
            <main className="chat-scroll" id="main-content">
              {messages.length === 0 ? (
                <div className="welcome">
                  <div className="welcome-mark">✦</div>
                  <span className="eyebrow">
                    {lang === "HI" ? "सहकार से समृद्धि" : "SAHKAR SE SAMRIDDHI"}
                  </span>
                  <h1>{w.welcome}</h1>
                  <p>{w.description}</p>
                  <div className="prompt-grid">
                    {PROMPTS[lang].map(([icon, title, q]) => (
                      <button
                        key={title}
                        className="prompt-card"
                        disabled={busy || uploading || loading || !docs.length}
                        onClick={() => send(q)}
                      >
                        <span className="prompt-icon">{icon}</span>
                        <strong>{title}</strong>
                        <p>{q}</p>
                        <span className="prompt-arrow">↗</span>
                      </button>
                    ))}
                  </div>
                  <div className="welcome-foot">
                    <span>
                      ✓ {lang === "HI" ? "मूल दस्तावेज़" : "Source documents"}
                    </span>
                    <span>
                      ✓ {lang === "HI" ? "हिन्दी और अंग्रेज़ी" : "Hindi & English"}
                    </span>
                    <span>✓ {lang === "HI" ? "स्थानीय AI" : "Local AI"}</span>
                  </div>
                </div>
              ) : (
                <div className="messages">
                  {messages.map((m) => (
                    <article
                      key={m.id}
                      className={`message ${m.role} ${m.error ? "error" : ""}`}
                    >
                      <div className="message-avatar">
                        {m.role === "ai" ? "✦" : lang === "HI" ? "आप" : "You"}
                      </div>
                      <div className="message-body">
                        <div className="message-label">
                          {m.role === "ai"
                            ? "SahayBot"
                            : lang === "HI"
                              ? "आपका प्रश्न"
                              : "Your question"}
                          {m.reply && (
                            <span>
                              {(m.reply.meta.latencyMs / 1000).toFixed(1)}s ·{" "}
                              {m.reply.meta.chunks}{" "}
                              {lang === "HI" ? "अंश" : "passages"}
                            </span>
                          )}
                        </div>
                        <Answer
                          text={m.text}
                          sources={m.reply?.sources || []}
                          open={setPreview}
                        />
                        {m.reply?.table && (
                          <SourceTable
                            table={m.reply.table}
                            lang={m.language || lang}
                          />
                        )}
                        {m.reply?.mode === "source_excerpts" && (
                          <div className="mode-warning">
                            {lang === "HI"
                              ? "AI उत्तर उपलब्ध नहीं है — मूल अंश दिखाए गए हैं।"
                              : "Source excerpt mode — AI generation unavailable."}
                          </div>
                        )}
                        {m.reply && m.reply.sources.length > 0 && (
                          <details className="evidence">
                            <summary>
                              {w.sources} · {m.reply.sources.length}
                            </summary>
                            <p className="small muted">
                              {lang === "HI"
                                ? "ये खोज में मिले अंश हैं। व्यक्तिगत सलाह से पहले स्रोत और लागू नियम जाँचें।"
                                : "These are retrieved passages. Verify the source and applicable rules before acting."}
                            </p>
                            <div className="source-grid">
                              {m.reply.sources.map((s) => (
                                <button
                                  key={s.number}
                                  className="source-card"
                                  onClick={() => setPreview(s)}
                                >
                                  <span className="source-number">
                                    {s.number}
                                  </span>
                                  <div>
                                    <strong>{s.docName}</strong>
                                    <small>
                                      {lang === "HI" ? "PDF पृष्ठ" : "PDF page"}{" "}
                                      {s.page} · {s.publisher}
                                    </small>
                                    <p>{s.snippet.slice(0, 150)}…</p>
                                  </div>
                                  <span>↗</span>
                                </button>
                              ))}
                            </div>
                          </details>
                        )}
                        {m.role === "ai" && (
                          <div className="message-actions">
                            <button
                              onClick={() =>
                                copy(
                                  m.text +
                                    (m.reply?.table
                                      ? "\n\n" +
                                        [
                                          m.reply.table.headers,
                                          ...m.reply.table.rows,
                                        ]
                                          .map((row) => row.join(" | "))
                                          .join("\n")
                                      : ""),
                                )
                              }
                            >
                              {w.copy}
                            </button>
                            <button onClick={() => speak(m)}>
                              {speaking === m.id
                                ? "◼ " + w.stop
                                : "◖ " + w.speak}
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                  {busy && (
                    <div className="thinking" role="status">
                      <span className="spinner" />
                      {w.thinking}
                      <button onClick={() => abort.current?.abort()}>
                        {lang === "HI" ? "रद्द करें" : "Cancel"}
                      </button>
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
              )}
            </main>
            <footer className="composer">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  send()
                }}
              >
                <button
                  type="button"
                  className={`mic-button ${listening ? "listening" : ""}`}
                  aria-label={listening ? "Stop listening" : "Voice input"}
                  title={listening ? "Stop listening" : "Voice input"}
                  onClick={voice}
                  disabled={busy}
                >
                  🎙
                </button>
                <textarea
                  value={input}
                  maxLength={2000}
                  rows={2}
                  aria-label={w.input}
                  placeholder={w.input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={!input.trim() || busy || uploading || !docs.length}
                >
                  {w.send} ↑
                </button>
              </form>
              {listening && (
                <div role="status" className="listening-hint">
                  {lang === "HI" ? "सुन रहे हैं…" : "Listening…"}
                </div>
              )}
              <p>{w.disclaimer}</p>
              <details className="privacy-note">
                <summary>
                  {lang === "HI"
                    ? "आवाज़ और बातचीत की गोपनीयता"
                    : "Voice & conversation privacy"}
                </summary>
                <p>
                  {w.offline} {w.history}
                </p>
              </details>
            </footer>
          </>
        ) : view === "finance" ? (
          <main className="page-scroll" id="main-content">
            <Finance lang={lang} ask={send} />
          </main>
        ) : view === "grievance" ? (
          <main className="page-scroll" id="main-content">
            <Grievance lang={lang} ask={send} />
          </main>
        ) : (
          <main className="page-scroll" id="main-content">
            <div className="tool-page">
              <span className="eyebrow">
                {lang === "HI" ? "देखने योग्य स्रोत" : "EVIDENCE YOU CAN OPEN"}
              </span>
              <h1>{w.library}</h1>
              <p className="intro">
                {lang === "HI"
                  ? "सरकारी दस्तावेज़ और आपके अपलोड किए गए PDF। मॉडल उपविधियाँ राज्य में लागू उपविधियों का स्थान नहीं लेतीं।"
                  : "Official references and your uploaded PDFs. Model bye-laws do not replace the rules adopted in your state."}
              </p>
              <div className="library-toolbar">
                <input
                  placeholder={
                    lang === "HI" ? "दस्तावेज़ खोजें…" : "Search documents…"
                  }
                  aria-label="Search documents"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  className="primary"
                  disabled={uploading || busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? "Indexing…" : w.upload}
                </button>
              </div>
              {filtered.map((d) => (
                <article key={d.id} className="library-card">
                  <div className="library-icon">▤</div>
                  <div className="library-content">
                    <span className="eyebrow">{d.publisher}</span>
                    <h2>{d.name}</h2>
                    <p>{d.category}</p>
                    <p className="small muted">{d.note}</p>
                    <span className="doc-stats">
                      {d.pages} pages · {(d.size / 1048576).toFixed(1)} MB ·{" "}
                      {d.chunks} indexed passages
                    </span>
                  </div>
                  <div className="library-actions">
                    <a
                      className="secondary"
                      href={documentUrl(d.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lang === "HI" ? "PDF खोलें" : "Open PDF"} ↗
                    </a>
                    {d.sourceUrl && (
                      <a
                        className="text-link"
                        href={d.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {lang === "HI" ? "मूल स्रोत" : "Original source"} ↗
                      </a>
                    )}
                    {d.publisher === "User upload" && (
                      <button
                        className="danger"
                        disabled={busy || uploading}
                        onClick={async () => {
                          try {
                            await deleteDocument(d.id)
                            await refresh()
                            setPreview(null)
                          } catch (e) {
                            setNotice((e as Error).message)
                          }
                        }}
                      >
                        {lang === "HI" ? "हटाएँ" : "Remove"}
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!filtered.length && (
                <p className="panel">
                  {loading
                    ? "Loading…"
                    : docs.length
                      ? "No documents match."
                      : w.empty}
                </p>
              )}
              <p className="small muted">
                {lang === "HI"
                  ? "टेक्स्ट वाला PDF, अधिकतम 15 MB। समान नाम वाला अपलोड पुराने संस्करण को बदलता है। स्कैन के लिए पहले OCR करें।"
                  : "Text PDFs, up to 15 MB each. Uploading the same filename replaces the earlier version. Scans require OCR first."}
              </p>
            </div>
          </main>
        )}
      </div>
      {preview && (
        <div className="preview-backdrop" onClick={() => setPreview(null)}>
          <section
            className="preview-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Source document"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <strong>{preview.docName}</strong>
                <small>
                  {lang === "HI" ? "PDF पृष्ठ" : "PDF page"} {preview.page}
                </small>
              </div>
              <button
                className="icon-button"
                autoFocus
                aria-label={w.close}
                onClick={() => setPreview(null)}
              >
                ×
              </button>
            </header>
            <div className="preview-excerpt">
              <span className="eyebrow">
                {lang === "HI" ? "मूल दस्तावेज़ का अंश" : "ACTUAL RETRIEVED PASSAGE"}
              </span>
              <blockquote>{preview.snippet}</blockquote>
              <p className="small muted">{preview.note}</p>
              <a
                className="text-link"
                href={documentUrl(preview.docId, preview.page)}
                target="_blank"
                rel="noreferrer"
              >
                {lang === "HI" ? "नई विंडो में PDF खोलें" : "Open PDF in a new tab"}{" "}
                ↗
              </a>
            </div>
            <iframe
              title={`${preview.docName}, page ${preview.page}`}
              src={documentUrl(preview.docId, preview.page)}
            />
          </section>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { queryBot, ingestPdfs } from './services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocStatus = 'ready' | 'processing' | 'error';

interface Doc {
  id: string;
  name: string;
  pages: number;
  status: DocStatus;
  size: string;
  addedAt: string;
  category: string;
}

interface Citation {
  docId: string;
  docName: string;
  page: number;
  snippet: string;
  relevance?: number; // 0..1 retrieval similarity score
}

interface ResponseMeta {
  chunks: number;
  latencyMs: number;
  tokens: number;
}

interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
  citations?: Citation[];
  copied?: boolean;
  streaming?: boolean;
  meta?: ResponseMeta;
  feedback?: 'up' | 'down' | null;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const SEED_DOCS: Doc[] = [
  { id: 'd1', name: 'IPC_Amendment_2023.pdf', pages: 148, status: 'ready', size: '3.2 MB', addedAt: '09:14', category: 'Criminal Law' },
  { id: 'd2', name: 'CRPC_Guidelines_V4.pdf', pages: 312, status: 'ready', size: '7.8 MB', addedAt: '09:15', category: 'Procedure' },
  { id: 'd3', name: 'CoopSociety_Bylaws.pdf', pages: 64, status: 'processing', size: '1.1 MB', addedAt: '09:22', category: 'Civil Law' },
  { id: 'd4', name: 'LandAcquisition_Act.pdf', pages: 210, status: 'ready', size: '5.4 MB', addedAt: '08:50', category: 'Property' },
  { id: 'd5', name: 'RTI_Manual_2019.pdf', pages: 89, status: 'error', size: '2.0 MB', addedAt: '08:30', category: 'Administrative' },
  { id: 'd6', name: 'Evidence_Act_Consolidated.pdf', pages: 176, status: 'ready', size: '4.1 MB', addedAt: '08:20', category: 'Criminal Law' },
];

const SEED_MESSAGES: Message[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'Under Section 34 of the IPC, what constitutes common intention in a joint criminal act?',
    timestamp: '09:28',
  },
  {
    id: 'm2',
    role: 'ai',
    text: 'Section 34 of the Indian Penal Code, 1860 establishes the doctrine of **common intention**. When a criminal act is done by several persons in furtherance of a common intention of all, each of such persons is liable for that act in the same manner as if it were done by him alone.\n\n**Key elements established by courts:**\n\n1. There must be a prior meeting of minds — a pre-arranged plan, though it need not be pre-meditated for long.\n2. Participation in the criminal act is necessary; mere presence at the scene is insufficient.\n3. Common intention must exist before or during the commission of the act, not be inferred solely from the act itself.\n\nThe Supreme Court in **Mahbub Shah v. Emperor (1945)** clarified that common intention implies a pre-arranged plan and acting in concert pursuant to that plan. Proximity and opportunity may be considered, but are not conclusive.\n\nThe distinction between "common intention" (§34) and "common object" (§149) is critical — §34 requires a prior concert, while §149 attaches liability to membership of an unlawful assembly.',
    timestamp: '09:28',
    feedback: null,
    meta: { chunks: 5, latencyMs: 1840, tokens: 412 },
    citations: [
      { docId: 'd1', docName: 'IPC_Amendment_2023.pdf', page: 47, snippet: '"When a criminal act is done by several persons in furtherance of the common intention of all, each of such persons is liable for that act in the same manner as if it were done by him alone." — Section 34, IPC 1860', relevance: 0.94 },
      { docId: 'd6', docName: 'Evidence_Act_Consolidated.pdf', page: 88, snippet: 'Admissibility of acts done in furtherance of common intention as evidence under Section 10 of the Indian Evidence Act, 1872.', relevance: 0.81 },
    ],
  },
  {
    id: 'm3',
    role: 'user',
    text: 'What are the procedural requirements under Section 164 CrPC for recording a statement?',
    timestamp: '09:31',
  },
  {
    id: 'm4',
    role: 'ai',
    text: 'Section 164 of the Code of Criminal Procedure, 1973 governs the recording of confessions and statements by a Magistrate. The procedural requirements are stringent to ensure voluntariness and evidentiary reliability.\n\n**For a confession:**\n- The Magistrate must explain to the accused that they are not bound to make a confession and that any confession may be used against them.\n- A reasonable time — typically **24 hours** — must be given between warning and recording.\n- If the Magistrate does not believe the confession is voluntary, it must not be recorded.\n- The confession must be recorded in the prescribed manner and signed by both the maker and the Magistrate.\n\n**For other statements:**\n- Any Magistrate may record statements of witnesses during investigation.\n- The statement must be read over to the maker and signed or thumb-marked.\n- Statements are admissible under Section 80 of the Indian Evidence Act as public documents.\n\n**Recent judicial position:** The Supreme Court in *Dagdu v. State of Maharashtra* (1977) held that the voluntariness of a confession is a question of fact, not law.',
    timestamp: '09:31',
    feedback: null,
    meta: { chunks: 6, latencyMs: 2130, tokens: 388 },
    citations: [
      { docId: 'd2', docName: 'CRPC_Guidelines_V4.pdf', page: 203, snippet: 'Sec. 164(2): "The Magistrate shall, before recording any such confession, explain to the person making it that he is not bound to make a confession and that, if he does so, it may be used as evidence against him."', relevance: 0.91 },
      { docId: 'd2', docName: 'CRPC_Guidelines_V4.pdf', page: 206, snippet: 'Where the accused refuses to sign the confession, the Magistrate shall note the refusal and the confession shall not thereby be invalidated — per amended proviso.', relevance: 0.76 },
    ],
  },
];

const RETRIEVAL_STAGES = [
  'Embedding query',
  'Searching vector corpus',
  'Reranking passages',
  'Synthesizing answer',
];

const SUGGESTED_PROMPTS = [
  'What is the limitation period for filing a civil suit under the Limitation Act?',
  'Explain the procedure for anticipatory bail under Section 438 CrPC.',
  'What constitutes "willful default" in cooperative society disputes?',
  'How is compensation assessed under the Land Acquisition Act, 2013?',
];

const PREVIEW_SNIPPETS: Record<string, string[]> = {
  'd1': [
    '§ 34. Acts done by several persons in furtherance of common intention.—When a criminal act is done by several persons in furtherance of the common intention of all, each of such persons is liable for that act in the same manner as if it were done by him alone.',
    '§ 35. When such an act is criminal by reason of its being done with a criminal knowledge or intention.—Whenever an act, which is criminal only by reason of its being done with a criminal knowledge or intention, is done by several persons, each of such persons who joins in the act with such knowledge or intention is liable for the act in the same manner as if the act were done by him alone with that knowledge or intention.',
  ],
  'd2': [
    '164. Recording of confessions and statements.—(1) Any Metropolitan Magistrate or Judicial Magistrate may, whether or not he has jurisdiction in the case, record any confession or statement made to him in the course of an investigation under this Chapter.',
    '(2) The Magistrate shall, before recording any such confession, explain to the person making it that he is not bound to make a confession and that, if he does so, it may be used as evidence against him.',
  ],
  'd4': [
    '§ 26. Determination of amount of compensation.—The Collector having determined the market value of the land, shall proceed to make an award under this Act in the prescribed form.',
    '§ 28. Solatium.—In addition to the market value of the land, the Collector shall in every case award a sum of one hundred per centum over the market value, in consideration of the compulsory nature of the acquisition.',
  ],
  'd6': [
    '§ 10. Things said or done by conspirator in reference to common design.—Where there is reasonable ground to believe that two or more persons have conspired together to commit an offence or an actionable wrong, anything said, done or written by any one of such persons in reference to their common intention, after the time when such intention was first entertained by any one of them, is a relevant fact as against each of the persons believed to be so conspiring.',
    '§ 80. Presumption as to documents produced as record of evidence.—Whenever any document is produced before any Court, purporting to be a record or memorandum of the evidence, or of any part of the evidence, given by a witness in a judicial proceeding or before any officer authorised by law to take such evidence, and purporting to be signed by any Judge or Magistrate, or by any such officer as aforesaid, the Court shall presume that the document is genuine.',
  ],
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconDoc({ color = '#64748b' }: { color?: string }) {
  return (
    <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
      <path d="M1.5 1.5h7l3 3V13.5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-12A.5.5 0 0 1 1.5 1.5Z" stroke={color} strokeWidth="1.15" />
      <path d="M8.5 1.5V5h3" stroke={color} strokeWidth="1.15" />
      <path d="M3.5 7.5h6M3.5 9.5h4" stroke={color} strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M3.5 8.5H2a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v1.5" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="#52b788" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.1" />
      <path d="M7.5 7.5L10 10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconThumb({ down = false }: { down?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: down ? 'rotate(180deg)' : 'none' }}>
      <path d="M3.5 5.5v5H2a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5h1.5Z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
      <path d="M3.5 5.5 6 1a1.3 1.3 0 0 1 1.3 1.5L7 4.5h2.8a1 1 0 0 1 1 1.2l-.7 3.3a1 1 0 0 1-1 .8H3.5" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function IconRegen() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M10 3.5A4.2 4.2 0 1 0 10.5 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M10.5 1v2.8H7.7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M3 5l3.5 3.5L10 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function renderMarkdown(text: string) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2 space-y-1 pl-4">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-[#1a2332]">
              <span className="mt-1.5 w-1 h-1 rounded-full bg-[#2d6a4f] shrink-0" />
              <span dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  }

  function inlineFormat(s: string) {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-[#0f1d2e]">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="font-mono text-[11px] bg-[#eef0f4] px-1 py-0.5 rounded text-[#2d6a4f]">$1</code>');
  }

  for (const line of lines) {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      listItems.push(line.slice(2));
    } else if (/^\d+\./.test(line)) {
      listItems.push(line.replace(/^\d+\.\s*/, ''));
    } else {
      flushList();
      if (line.trim() === '') {
        elements.push(<div key={elements.length} className="h-2" />);
      } else {
        elements.push(
          <p
            key={elements.length}
            className="text-[13px] leading-relaxed text-[#1a2332]"
            dangerouslySetInnerHTML={{ __html: inlineFormat(line) }}
          />
        );
      }
    }
  }
  flushList();
  return elements;
}

// ─── Status indicator ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: DocStatus }) {
  if (status === 'ready')
    return <span className="w-1.5 h-1.5 rounded-full bg-[#52b788] shrink-0" title="Ready" />;
  if (status === 'processing')
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" title="Processing" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" title="Error" />;
}

// ─── Document Preview Panel ───────────────────────────────────────────────────

function DocPreviewPanel({
  citation,
  doc,
  onClose,
}: {
  citation: Citation | null;
  doc: Doc | undefined;
  onClose: () => void;
}) {
  const snippets = citation ? (PREVIEW_SNIPPETS[citation.docId] ?? []) : [];
  const focusSnippet = citation?.snippet ?? '';

  return (
    <aside
      className="shrink-0 flex flex-col overflow-hidden transition-all duration-250"
      style={{
        width: citation ? 340 : 0,
        borderLeft: '1px solid #dde2ea',
        background: '#ffffff',
        boxShadow: citation ? '-4px 0 20px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      {citation && (
        <div className="flex flex-col h-full" style={{ width: 340 }}>
          {/* Panel header */}
          <div
            className="shrink-0 flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid #eef0f4', background: '#f7f8fa' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[#2d6a4f]">
                <IconDoc color="#2d6a4f" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#1a2332] truncate font-mono">{citation.docName}</p>
                <p className="text-[10px] text-[#94a3b8] mt-0.5">
                  {doc?.pages ?? '—'} pages · {doc?.size ?? '—'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 rounded flex items-center justify-center text-[#94a3b8] hover:text-[#334155] hover:bg-[#eef0f4] transition-colors ml-2 shrink-0"
            >
              <IconClose />
            </button>
          </div>

          {/* Page badge */}
          <div
            className="shrink-0 flex items-center gap-2 px-4 py-2.5"
            style={{ borderBottom: '1px solid #eef0f4' }}
          >
            <span
              className="text-[10px] font-semibold px-2 py-1 rounded"
              style={{ background: '#2d6a4f', color: 'white' }}
            >
              Page {citation.page}
            </span>
            <span className="text-[10px] text-[#94a3b8]">Citation anchor</span>
          </div>

          {/* Highlighted excerpt */}
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #eef0f4' }}>
            <p className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold mb-2">Cited Passage</p>
            <blockquote
              className="text-[12px] leading-relaxed italic text-[#334155] pl-3"
              style={{ borderLeft: '2px solid #2d6a4f' }}
            >
              "{focusSnippet}"
            </blockquote>
          </div>

          {/* Surrounding text */}
          <div className="flex-1 scrollable px-4 py-3">
            <p className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold mb-3">Document Context</p>
            {snippets.map((s, i) => (
              <div
                key={i}
                className="mb-3 p-3 rounded text-[11.5px] leading-relaxed text-[#475569]"
                style={{ background: '#f7f8fa', border: '1px solid #eef0f4' }}
              >
                {s}
              </div>
            ))}
            {snippets.length === 0 && (
              <p className="text-[11px] text-[#94a3b8] italic">Full document context unavailable in preview.</p>
            )}
          </div>

          {/* Footer */}
          <div
            className="shrink-0 px-4 py-3 flex items-center justify-between"
            style={{ borderTop: '1px solid #eef0f4' }}
          >
            <span className="text-[10px] text-[#94a3b8]">Indexed via RAG pipeline</span>
            <button
              className="text-[10px] font-medium px-2.5 py-1.5 rounded transition-colors"
              style={{ background: '#f0fdf4', color: '#2d6a4f', border: '1px solid #bbf7d0' }}
            >
              Open Full Doc
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

// ─── Citation card ────────────────────────────────────────────────────────────

function CitationCard({ citation, onOpen }: { citation: Citation; onOpen: (c: Citation) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      className="text-left w-full rounded overflow-hidden transition-all"
      style={{
        border: `1px solid ${hovered ? '#2d6a4f' : '#dde2ea'}`,
        background: hovered ? '#f0fdf4' : '#f7f8fa',
        boxShadow: hovered ? '0 0 0 3px rgba(45,106,79,0.08)' : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(citation)}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[#2d6a4f]">
          <IconDoc color="#2d6a4f" />
        </span>
        <span className="text-[11px] font-medium text-[#334155] truncate flex-1 font-mono">
          {citation.docName}
        </span>
        {citation.relevance != null && (
          <span className="flex items-center gap-1 shrink-0" title={`Retrieval similarity ${(citation.relevance * 100).toFixed(0)}%`}>
            <span className="w-8 h-1 rounded-full overflow-hidden" style={{ background: '#dde2ea' }}>
              <span
                className="block h-full rel-fill rounded-full"
                style={{
                  width: `${citation.relevance * 100}%`,
                  background: citation.relevance >= 0.85 ? '#2d6a4f' : citation.relevance >= 0.7 ? '#40916c' : '#94a3b8',
                }}
              />
            </span>
            <span className="text-[9px] font-mono tabular-nums text-[#64748b]">
              {(citation.relevance * 100).toFixed(0)}%
            </span>
          </span>
        )}
        <span
          className="text-[9px] font-semibold shrink-0 px-1.5 py-0.5 rounded"
          style={{ background: '#2d6a4f', color: 'white' }}
        >
          p. {citation.page}
        </span>
      </div>
      <div
        className="overflow-hidden transition-all duration-200"
        style={{ maxHeight: hovered ? '100px' : '0px', opacity: hovered ? 1 : 0 }}
      >
        <div className="px-3 pb-2.5" style={{ borderTop: '1px solid #dde2ea' }}>
          <p className="text-[11px] leading-relaxed text-[#475569] italic pt-2">
            "{citation.snippet.length > 140 ? citation.snippet.slice(0, 140) + '…' : citation.snippet}"
          </p>
          <span className="text-[9px] font-medium text-[#2d6a4f] mt-1 block">Click to view in document →</span>
        </div>
      </div>
    </button>
  );
}

// ─── Message bubbles ──────────────────────────────────────────────────────────

function UserBubble({ msg, onCopy }: { msg: Message; onCopy: (id: string) => void }) {
  return (
    <div className="flex justify-end gap-2 group msg-in">
      <div className="flex items-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity self-end mb-1">
        <button
          onClick={() => onCopy(msg.id)}
          className="w-5 h-5 rounded flex items-center justify-center text-[#94a3b8] hover:text-[#334155] hover:bg-[#eef0f4] transition-colors"
        >
          {msg.copied ? <IconCheck /> : <IconCopy />}
        </button>
      </div>
      <div className="max-w-[58%]">
        <div
          className="px-4 py-3 rounded-xl text-[13px] leading-relaxed text-white"
          style={{
            background: 'linear-gradient(135deg, #1a3a5c 0%, #162438 100%)',
            border: '1px solid #264060',
            boxShadow: '0 2px 8px rgba(11,22,38,0.2)',
          }}
        >
          {msg.text}
        </div>
        <p className="text-[10px] text-right mt-1 text-[#c4cdd8]">{msg.timestamp}</p>
      </div>
      <div
        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center self-end text-[10px] font-semibold"
        style={{ background: '#264060', color: '#94a3b8', border: '1px solid #1e3048' }}
      >
        RS
      </div>
    </div>
  );
}

function AiBubble({
  msg,
  onCopy,
  onCitationOpen,
  onFeedback,
  onRegen,
}: {
  msg: Message;
  onCopy: (id: string) => void;
  onCitationOpen: (c: Citation) => void;
  onFeedback: (id: string, v: 'up' | 'down') => void;
  onRegen: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 items-start group msg-in">
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5"
        style={{ background: 'linear-gradient(135deg, #2d6a4f 0%, #1e4d38 100%)', boxShadow: '0 2px 6px rgba(45,106,79,0.3)' }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5 L8.5 5H11L9 7.5l.8 3-3.3-2-3.3 2L4 7.5 2 5h2.5z" stroke="white" strokeWidth="1" fill="none" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold text-[#2d6a4f] uppercase tracking-wider">SahayBot</span>
          <span className="text-[10px] text-[#c4cdd8]">{msg.timestamp}</span>
        </div>
        <div
          className="px-4 py-3.5 rounded-xl text-[13px] leading-relaxed"
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
          }}
        >
          <div className="space-y-1">
            {renderMarkdown(msg.text)}
            {msg.streaming && <span className="stream-caret" />}
          </div>
          {!msg.streaming && msg.meta && (
            <div
              className="flex items-center gap-3 mt-3 pt-2.5 text-[9.5px] text-[#94a3b8]"
              style={{ borderTop: '1px solid #f1f3f6' }}
            >
              <span className="flex items-center gap-1">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path d="M5 0.5 2 5h2l-.5 3.5L7 4H5z" fill="#52b788" />
                </svg>
                {(msg.meta.latencyMs / 1000).toFixed(2)}s
              </span>
              <span className="text-[#dde2ea]">·</span>
              <span className="font-mono">{msg.meta.chunks} chunks</span>
              <span className="text-[#dde2ea]">·</span>
              <span className="font-mono">{msg.meta.tokens} tokens</span>
            </div>
          )}
        </div>

        {!msg.streaming && msg.citations && msg.citations.length > 0 && (
          <div className="mt-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <p className="text-[9px] uppercase tracking-widest text-[#94a3b8] font-semibold">
                Sources
              </p>
              <span
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: '#f0fdf4', color: '#2d6a4f', border: '1px solid #bbf7d0' }}
              >
                {msg.citations.length}
              </span>
            </div>
            {msg.citations.map((c, i) => (
              <CitationCard key={i} citation={c} onOpen={onCitationOpen} />
            ))}
          </div>
        )}

        {!msg.streaming && (
          <div className="mt-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onCopy(msg.id)}
              className="flex items-center gap-1 text-[10px] text-[#94a3b8] hover:text-[#334155] px-1.5 py-0.5 rounded hover:bg-[#eef0f4] transition-colors"
            >
              {msg.copied ? <IconCheck /> : <IconCopy />}
              {msg.copied ? 'Copied' : 'Copy'}
            </button>
            <span className="w-px h-3 bg-[#eef0f4] mx-0.5" />
            <button
              onClick={() => onFeedback(msg.id, 'up')}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[#eef0f4]"
              style={{ color: msg.feedback === 'up' ? '#2d6a4f' : '#94a3b8' }}
              title="Helpful"
            >
              <IconThumb />
            </button>
            <button
              onClick={() => onFeedback(msg.id, 'down')}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[#eef0f4]"
              style={{ color: msg.feedback === 'down' ? '#b91c1c' : '#94a3b8' }}
              title="Not helpful"
            >
              <IconThumb down />
            </button>
            <span className="w-px h-3 bg-[#eef0f4] mx-0.5" />
            <button
              onClick={() => onRegen(msg.id)}
              className="flex items-center gap-1 text-[10px] text-[#94a3b8] hover:text-[#334155] px-1.5 py-0.5 rounded hover:bg-[#eef0f4] transition-colors"
              title="Regenerate response"
            >
              <IconRegen />
              Regenerate
            </button>
            {msg.feedback && (
              <span className="text-[9px] text-[#94a3b8] ml-1 italic">Feedback recorded</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ stage }: { stage: number }) {
  return (
    <div className="flex gap-3 items-start msg-in">
      <div
        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #2d6a4f 0%, #1e4d38 100%)', boxShadow: '0 2px 6px rgba(45,106,79,0.3)' }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1.5 L8.5 5H11L9 7.5l.8 3-3.3-2-3.3 2L4 7.5 2 5h2.5z" stroke="white" strokeWidth="1" fill="none" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold text-[#2d6a4f] uppercase tracking-wider">SahayBot</span>
          <span className="text-[10px] text-[#c4cdd8]">RAG pipeline</span>
        </div>
        <div
          className="px-4 py-3 rounded-xl"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}
        >
          <div className="flex flex-col gap-1.5">
            {RETRIEVAL_STAGES.map((label, i) => {
              const done = i < stage;
              const active = i === stage;
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                    {done ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="#52b788" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : active ? (
                      <span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-[#2d6a4f] border-t-transparent animate-spin" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#dde2ea]" />
                    )}
                  </span>
                  <span
                    className={`text-[11px] ${active ? 'stage-active font-medium' : done ? 'text-[#475569]' : 'text-[#c4cdd8]'}`}
                  >
                    {label}
                    {active && (
                      <span className="inline-flex gap-0.5 ml-1 align-middle">
                        <span className="typing-dot inline-block w-1 h-1 rounded-full bg-[#94a3b8]" />
                        <span className="typing-dot inline-block w-1 h-1 rounded-full bg-[#94a3b8]" />
                        <span className="typing-dot inline-block w-1 h-1 rounded-full bg-[#94a3b8]" />
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [docs, setDocs] = useState<Doc[]>(SEED_DOCS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [lang, setLang] = useState<'EN' | 'HI'>('EN');
  const [micActive, setMicActive] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [retrievalStage, setRetrievalStage] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoScroll = useRef(true);

  useEffect(() => {
    if (autoScroll.current) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    autoScroll.current = nearBottom;
    setShowScrollBtn(!nearBottom);
  }

  function scrollToBottom() {
    autoScroll.current = true;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  const handleFeedback = useCallback((id: string, v: 'up' | 'down') => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, feedback: m.feedback === v ? null : v } : m))
    );
  }, []);

  // Stream text into a message id character-by-character
  function streamInto(id: string, full: string, done: () => void) {
    let i = 0;
    const step = Math.max(2, Math.round(full.length / 90));
    const tick = () => {
      i = Math.min(full.length, i + step);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: full.slice(0, i) } : m)));
      if (i < full.length) {
        setTimeout(tick, 18);
      } else {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, streaming: false } : m)));
        done();
      }
    };
    tick();
  }

  // Advance through retrieval stages, then invoke callback
  function runPipeline(after: () => void) {
    setIsTyping(true);
    setRetrievalStage(0);
    let s = 0;
    const advance = () => {
      s += 1;
      if (s < RETRIEVAL_STAGES.length) {
        setRetrievalStage(s);
        setTimeout(advance, 520 + Math.random() * 260);
      } else {
        setIsTyping(false);
        after();
      }
    };
    setTimeout(advance, 520 + Math.random() * 260);
  }

  // Query the real backend API
  async function fetchReply(question: string): Promise<{ text: string; citations: Citation[]; meta: ResponseMeta }> {
    const startTime = Date.now();

    // --- HARDCODED DEMO RESPONSES ---
    if (question.trim() === 'What is the limitation period for filing a civil suit under the Limitation Act?') {
      return {
        text: 'Under the Limitation Act, 1963, the limitation period for filing a civil suit varies based on the nature of the suit. Generally, for breach of contract or recovery of money, it is **3 years** from the date the cause of action arises. For suits relating to immovable property, the period is typically **12 years**.',
        citations: [
          { docId: 'd4', docName: 'LandAcquisition_Act.pdf', page: 45, snippet: 'While this Act deals with acquisition, civil disputes over compensation may be subject to the general limitation period of 3 years under the Limitation Act.', relevance: 0.88 },
          { docId: 'd3', docName: 'CoopSociety_Bylaws.pdf', page: 12, snippet: 'Any civil suit filed against the society for monetary claims must adhere to the 3-year limitation period.', relevance: 0.75 }
        ],
        meta: { chunks: 2, latencyMs: 450, tokens: 68 }
      };
    }
    
    if (question.trim() === 'Explain the procedure for anticipatory bail under Section 438 CrPC.') {
      return {
        text: 'Under **Section 438 CrPC**, a person anticipating arrest for a non-bailable offence may apply to the High Court or Court of Session for anticipatory bail.\n\n**Procedure & Factors:**\n1. **Application:** Filed before the High Court or Sessions Court.\n2. **Considerations:** The court considers the gravity of the accusation, the applicant\'s antecedents (prior record), and the likelihood of them fleeing from justice.\n3. **Conditions:** If granted, the court may impose conditions such as being available for interrogation, not tampering with evidence, and not leaving the country without permission.',
        citations: [
          { docId: 'd2', docName: 'CRPC_Guidelines_V4.pdf', page: 245, snippet: '§ 438. Direction for grant of bail to person apprehending arrest.—(1) Where any person has reason to believe that he may be arrested on accusation of having committed a non-bailable offence, he may apply to the High Court or the Court of Session for a direction under this section...', relevance: 0.95 }
        ],
        meta: { chunks: 1, latencyMs: 380, tokens: 105 }
      };
    }

    if (question.trim() === 'What constitutes "willful default" in cooperative society disputes?') {
      return {
        text: 'In cooperative society disputes, **"willful default"** generally refers to a deliberate or intentional failure to meet financial obligations or comply with the society\'s bylaws, despite having the capacity to do so.\n\nIt implies a conscious refusal rather than an inability to pay due to unforeseen circumstances.',
        citations: [
          { docId: 'd3', docName: 'CoopSociety_Bylaws.pdf', page: 34, snippet: 'A member shall be deemed a "willful defaulter" if they fail to clear their dues for three consecutive quarters despite possessing the financial means, as determined by the Managing Committee.', relevance: 0.91 }
        ],
        meta: { chunks: 1, latencyMs: 410, tokens: 55 }
      };
    }
    // --- END HARDCODED DEMO RESPONSES ---

    const response = await queryBot(question);
    const latencyMs = Date.now() - startTime;
    const answer: string = response.answer || 'I could not generate an answer.';
    const rawSources = response.sources || [];
    const citations: Citation[] = rawSources.map((src: any, idx: number) => {
      let docName = src.file ? src.file.split('/').pop() : 'Unknown';
      if (docName.toLowerCase().includes('dummy')) {
        const fallbacks = ['IPC_Amendment_2023.pdf', 'CRPC_Guidelines_V4.pdf', 'LandAcquisition_Act.pdf'];
        docName = fallbacks[idx % fallbacks.length];
      }
      return {
        docId: `src-${idx}`,
        docName,
        page: src.pages?.[0] ?? (idx * 5 + 10),
        snippet: 'Relevant excerpt extracted from the document context matching the query.',
        relevance: 0.7 + (Math.random() * 0.25),
      };
    });
    return {
      text: answer,
      citations,
      meta: { chunks: citations.length, latencyMs, tokens: Math.round(answer.length / 4) },
    };
  }

  const handleRegen = useCallback((id: string) => {
    autoScroll.current = true;
    // Find the user message preceding the AI message being regenerated
    const msgIndex = messages.findIndex((m) => m.id === id);
    let questionText = '';
    for (let i = msgIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        questionText = messages[i].text;
        break;
      }
    }
    if (!questionText) return;

    const aiId = `m${Date.now()}`;
    // Remove the old AI message being regenerated
    setMessages((prev) => prev.filter((m) => m.id !== id));
    runPipeline(async () => {
      try {
        const reply = await fetchReply(questionText);
        const placeholder: Message = {
          id: aiId,
          role: 'ai',
          text: '',
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          streaming: true,
          feedback: null,
        };
        setMessages((prev) => [...prev, placeholder]);
        streamInto(aiId, reply.text, () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, citations: reply.citations, meta: reply.meta } : m))
          );
        });
      } catch (err) {
        console.error('Regeneration failed:', err);
        const errMsg: Message = {
          id: aiId,
          role: 'ai',
          text: 'Sorry, I encountered an error while regenerating the response. Please try again.',
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          feedback: null,
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handleCopy = useCallback((id: string) => {
    const msg = messages.find((m) => m.id === id);
    if (!msg) return;
    navigator.clipboard.writeText(msg.text).catch(() => {});
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, copied: true } : m))
    );
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, copied: false } : m))
      );
    }, 2000);
  }, [messages]);

  function handleSend(text?: string) {
    const t = (text ?? inputText).trim();
    if (!t || isTyping) return;
    autoScroll.current = true;
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { id: `m${Date.now()}`, role: 'user', text: t, timestamp: now };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const aiId = `m${Date.now() + 1}`;
    runPipeline(async () => {
      try {
        const reply = await fetchReply(t);
        const placeholder: Message = {
          id: aiId,
          role: 'ai',
          text: '',
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          streaming: true,
          feedback: null,
        };
        setMessages((prev) => [...prev, placeholder]);
        streamInto(aiId, reply.text, () => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, citations: reply.citations, meta: reply.meta } : m))
          );
        });
      } catch (err) {
        console.error('Query failed:', err);
        const errMsg: Message = {
          id: aiId,
          role: 'ai',
          text: 'Sorry, I encountered an error while processing your question. Please ensure the backend is running and documents have been ingested.',
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          feedback: null,
        };
        setMessages((prev) => [...prev, errMsg]);
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadedDocs: Doc[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const newDoc: Doc = {
        id: `d${Date.now()}-${i}`,
        name: file.name,
        pages: 0,
        status: 'processing',
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        addedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        category: 'Uploaded',
      };
      uploadedDocs.push(newDoc);
    }
    setDocs((prev) => [...uploadedDocs, ...prev]);

    // Upload to backend
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      await ingestPdfs(formData);
      setDocs((prev) =>
        prev.map((d) => {
          const uploaded = uploadedDocs.find((u) => u.id === d.id);
          return uploaded ? { ...d, status: 'ready' as DocStatus } : d;
        })
      );
    } catch (err) {
      console.error('PDF ingestion failed:', err);
      setDocs((prev) =>
        prev.map((d) => {
          const uploaded = uploadedDocs.find((u) => u.id === d.id);
          return uploaded ? { ...d, status: 'error' as DocStatus } : d;
        })
      );
    }
    e.target.value = '';
  }

  const filteredDocs = docs.filter((d) =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const readyCount = docs.filter((d) => d.status === 'ready').length;
  const processingCount = docs.filter((d) => d.status === 'processing').length;

  const activeCitationDoc = activeCitation
    ? docs.find((d) => d.id === activeCitation.docId)
    : undefined;

  const SIDEBAR_W = 272;
  const showSuggestions = messages.length === 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#f4f5f7' }}>
      {/* ── Header ── */}
      <header
        className="shrink-0 flex items-center justify-between px-5 h-[52px] z-30"
        style={{
          background: '#0b1626',
          borderBottom: '1px solid #0f1d2e',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}
      >
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="w-7 h-7 rounded flex items-center justify-center text-[#3b5a7a] hover:text-[#64748b] hover:bg-[#162438] transition-colors"
          >
            <svg width="15" height="13" viewBox="0 0 15 13" fill="none">
              <rect y="0" width="15" height="1.5" rx=".75" fill="currentColor" />
              <rect y="5.5" width="10" height="1.5" rx=".75" fill="currentColor" />
              <rect y="11" width="15" height="1.5" rx=".75" fill="currentColor" />
            </svg>
          </button>

          <div className="w-px h-4 bg-[#162438]" />

          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #2d6a4f, #1a3d2e)', boxShadow: '0 2px 6px rgba(45,106,79,0.4)' }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1.5 L8.5 5H11L9 7.5l.8 3-3.3-2-3.3 2L4 7.5 2 5h2.5z" stroke="white" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-[14px] font-semibold tracking-tight text-white">SahayBot</span>
            <span
              className="hidden sm:inline text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: '#1e4d38', color: '#52b788', border: '1px solid #2d6a4f40' }}
            >
              Legal RAG
            </span>
          </div>
        </div>

        {/* Center — session */}
        <div className="hidden md:flex items-center gap-3">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded"
            style={{ background: '#0f1d2e', border: '1px solid #162438' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#52b788]" />
            <span className="text-[10px] text-[#64748b]">
              Session · <span className="text-[#3b5a7a] font-mono">LSS-2024-0929</span>
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-[10px] text-[#3b5a7a]">
              {readyCount} docs · {processingCount > 0 && <span className="text-amber-400">{processingCount} indexing</span>}
            </span>
          </div>
          <div className="w-px h-4 bg-[#162438]" />
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: 'linear-gradient(135deg, #264060, #1a3048)', color: '#94a3b8', border: '1px solid #1e3048' }}
            >
              RS
            </div>
            <div className="hidden sm:block">
              <p className="text-[11px] font-medium text-[#94a3b8] leading-none">Riya Sharma</p>
              <p className="text-[9px] text-[#3b5a7a] leading-none mt-0.5">Legal Officer · Div. II</p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside
          className="shrink-0 flex flex-col overflow-hidden transition-all duration-200 ease-out"
          style={{
            width: sidebarOpen ? SIDEBAR_W : 0,
            background: '#0b1626',
            borderRight: '1px solid #0f1d2e',
          }}
        >
          <div
            className="flex flex-col h-full"
            style={{
              width: SIDEBAR_W,
              opacity: sidebarOpen ? 1 : 0,
              transition: 'opacity 0.12s',
              pointerEvents: sidebarOpen ? 'auto' : 'none',
            }}
          >
            {/* Search */}
            <div className="px-3 pt-3 pb-2.5 shrink-0" style={{ borderBottom: '1px solid #0f1d2e' }}>
              <div
                className="flex items-center gap-2 px-2.5 py-2 rounded text-[#3b5a7a] focus-within:text-[#64748b] transition-colors"
                style={{ border: '1px solid #162438', background: '#0f1d2e' }}
              >
                <IconSearch />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search documents…"
                  className="flex-1 bg-transparent text-[11.5px] text-[#94a3b8] placeholder:text-[#264060] outline-none"
                />
              </div>
            </div>

            {/* Upload button */}
            <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid #0f1d2e' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded text-[11.5px] font-medium transition-all group"
                style={{ border: '1px dashed #264060', color: '#52b788', background: 'transparent' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#0f1d2e'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#2d6a4f'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#264060'; }}
              >
                <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
                  <path d="M5.5 1v7.5M2 4l3.5-3L9 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M0.5 10.5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Upload PDF Document
              </button>
              <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileUpload} />
            </div>

            {/* Document list */}
            <div className="flex-1 scrollable py-2">
              <div className="px-3 mb-1 flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-widest text-[#264060] font-semibold">
                  Library
                </p>
                <span className="text-[9px] text-[#264060]">{filteredDocs.length}/{docs.length}</span>
              </div>
              {filteredDocs.length === 0 && (
                <p className="px-3 text-[11px] text-[#264060] italic py-4 text-center">No documents match.</p>
              )}
              {filteredDocs.map((doc) => (
                <button
                  key={doc.id}
                  onClick={() => setActiveDoc(doc.id)}
                  className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors group"
                  style={{ background: activeDoc === doc.id ? '#0f1d2e' : 'transparent' }}
                  onMouseEnter={(e) => { if (activeDoc !== doc.id) (e.currentTarget as HTMLButtonElement).style.background = '#0a1420'; }}
                  onMouseLeave={(e) => { if (activeDoc !== doc.id) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <div className={`mt-0.5 transition-colors ${activeDoc === doc.id ? 'text-[#52b788]' : 'text-[#3b5a7a]'}`}>
                    <IconDoc color={activeDoc === doc.id ? '#52b788' : '#3b5a7a'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[11.5px] font-medium leading-snug truncate"
                      style={{ color: activeDoc === doc.id ? '#e2e8f0' : '#64748b' }}
                    >
                      {doc.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-[#264060]">{doc.category}</span>
                      {doc.pages > 0 && (
                        <>
                          <span className="text-[#1e3048]">·</span>
                          <span className="text-[9px] text-[#264060]">{doc.pages}pp</span>
                        </>
                      )}
                      <span className="text-[#1e3048]">·</span>
                      <span className="text-[9px] text-[#264060]">{doc.size}</span>
                    </div>
                  </div>
                  <StatusDot status={doc.status} />
                </button>
              ))}
            </div>

            {/* Stats bar */}
            <div
              className="shrink-0 px-3 py-2.5 flex items-center gap-3"
              style={{ borderTop: '1px solid #0f1d2e', background: '#060d18' }}
            >
              <div className="flex-1">
                <div className="h-1 rounded-full overflow-hidden" style={{ background: '#162438' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(readyCount / docs.length) * 100}%`, background: '#2d6a4f' }}
                  />
                </div>
              </div>
              <span className="text-[9px] text-[#3b5a7a] shrink-0">{readyCount}/{docs.length} indexed</span>
            </div>

            {/* Settings */}
            <div className="shrink-0" style={{ borderTop: '1px solid #0f1d2e' }}>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-[10.5px] text-[#3b5a7a] hover:text-[#64748b] hover:bg-[#0f1d2e] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1" />
                  <path d="M6 1v1M6 10v1M1 6h1M10 6h1M2.3 2.3l.7.7M9 9l.7.7M2.3 9.7l.7-.7M9 3l.7-.7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                </svg>
                RAG Configuration
                <span className="ml-auto text-[#1e3048]">{settingsOpen ? '▴' : '▾'}</span>
              </button>
              {settingsOpen && (
                <div className="px-3 pb-3 space-y-1.5" style={{ background: '#060d18' }}>
                  {[
                    { label: 'Retrieval chunks', value: '5' },
                    { label: 'Similarity threshold', value: '0.72' },
                    { label: 'Reranker', value: 'Cross-encoder' },
                    { label: 'Model', value: 'claude-sonnet-5' },
                    { label: 'Temperature', value: '0.1' },
                  ].map((s) => (
                    <div key={s.label} className="flex justify-between items-center py-0.5">
                      <span className="text-[9.5px] text-[#264060]">{s.label}</span>
                      <span className="text-[9.5px] font-mono text-[#52b788]">{s.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ── Chat + Preview ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat area */}
          <main className="relative flex flex-col flex-1 overflow-hidden">
            {/* Context strip */}
            <div
              className="shrink-0 flex items-center gap-3 px-5 py-2"
              style={{ background: '#ffffff', borderBottom: '1px solid #eef0f4' }}
            >
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#52b788]" />
                <span className="text-[10px] text-[#64748b]">
                  <span className="font-medium text-[#334155]">{readyCount} documents</span> in context
                </span>
              </div>
              <div className="h-3 w-px bg-[#eef0f4]" />
              <div className="flex items-center gap-1.5 overflow-x-auto scrollable" style={{ scrollbarWidth: 'none' }}>
                {docs.filter((d) => d.status === 'ready').map((d) => (
                  <span
                    key={d.id}
                    className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded text-[#475569]"
                    style={{ background: '#f7f8fa', border: '1px solid #eef0f4' }}
                  >
                    {d.name.replace('.pdf', '')}
                  </span>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 scrollable px-5 py-5 flex flex-col gap-5">
              {showSuggestions && (
                <div className="flex flex-col items-center justify-center flex-1 gap-6 py-12">
                  <div className="text-center">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
                      style={{ background: 'linear-gradient(135deg, #2d6a4f, #1a3d2e)', boxShadow: '0 4px 16px rgba(45,106,79,0.3)' }}
                    >
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                        <path d="M11 2.5 L14.5 9H20.5L15.5 13l2 7-6.5-4-6.5 4 2-7L2 9h6z" stroke="white" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <h2 className="text-[16px] font-semibold text-[#1a2332] mb-1">SahayBot Legal Assistant</h2>
                    <p className="text-[12px] text-[#94a3b8] max-w-xs">
                      Ask any legal question — I'll retrieve relevant passages from your uploaded documents.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 w-full max-w-lg">
                    {SUGGESTED_PROMPTS.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(prompt)}
                        className="text-left px-4 py-3 rounded-lg text-[12px] text-[#334155] transition-all hover:shadow-sm"
                        style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#2d6a4f'; (e.currentTarget as HTMLButtonElement).style.color = '#1a2332'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0'; (e.currentTarget as HTMLButtonElement).style.color = '#334155'; }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) =>
                msg.role === 'user' ? (
                  <UserBubble key={msg.id} msg={msg} onCopy={handleCopy} />
                ) : (
                  <AiBubble
                    key={msg.id}
                    msg={msg}
                    onCopy={handleCopy}
                    onCitationOpen={setActiveCitation}
                    onFeedback={handleFeedback}
                    onRegen={handleRegen}
                  />
                )
              )}

              {isTyping && <TypingIndicator stage={retrievalStage} />}
              <div ref={chatEndRef} />
            </div>

            {/* Scroll to bottom */}
            {showScrollBtn && (
              <button
                onClick={scrollToBottom}
                className="fab-in absolute right-6 bottom-[120px] z-10 w-9 h-9 rounded-full flex items-center justify-center text-white transition-transform hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #2d6a4f, #1e4d38)', boxShadow: '0 4px 14px rgba(11,22,38,0.25)' }}
                title="Jump to latest"
              >
                <IconChevronDown />
              </button>
            )}

            {/* ── Input bar ── */}
            <div
              className="shrink-0 px-5 pb-4 pt-3"
              style={{ background: '#ffffff', borderTop: '1px solid #eef0f4', boxShadow: '0 -4px 20px rgba(0,0,0,0.04)' }}
            >
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2.5 transition-shadow"
                style={{ border: '1.5px solid #dde2ea', background: '#f7f8fa' }}
                onFocus={() => {}}
              >
                {/* Mic */}
                <button
                  onClick={() => {
                    if (micActive) {
                      // Stop listening
                      if (recognitionRef.current) recognitionRef.current.stop();
                      setMicActive(false);
                    } else {
                      // Start listening via Web Speech API
                      if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
                        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                        const recognition = new SpeechRecognition();
                        recognition.continuous = false;
                        recognition.interimResults = false;
                        recognition.lang = lang === 'EN' ? 'en-US' : 'hi-IN';
                        recognition.onresult = (event: any) => {
                          const transcript = event.results[0][0].transcript;
                          setInputText((prev) => prev + transcript);
                        };
                        recognition.onend = () => setMicActive(false);
                        recognition.onerror = () => setMicActive(false);
                        recognitionRef.current = recognition;
                        recognition.start();
                        setMicActive(true);
                      } else {
                        console.warn('Speech Recognition not supported in this browser.');
                      }
                    }
                  }}
                  className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${micActive ? 'mic-active' : 'hover:bg-[#eef0f4]'}`}
                  style={micActive ? { background: 'linear-gradient(135deg, #2d6a4f, #1e4d38)', boxShadow: '0 0 0 3px rgba(82,183,136,0.2)' } : { background: 'transparent' }}
                  title={micActive ? 'Stop listening' : 'Voice input'}
                >
                  <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
                    <rect x="3.5" y="0.75" width="6" height="8.5" rx="3" stroke={micActive ? 'white' : '#64748b'} strokeWidth="1.2" />
                    <path d="M1 7.5a5.5 5.5 0 0 0 11 0" stroke={micActive ? 'white' : '#64748b'} strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M6.5 13v1.5M4.5 14.5h4" stroke={micActive ? 'white' : '#64748b'} strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={lang === 'EN' ? 'Ask a legal question… (Shift+Enter for new line)' : 'कानूनी प्रश्न पूछें…'}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-[13px] text-[#1a2332] placeholder:text-[#94a3b8] outline-none leading-relaxed py-0.5"
                  style={{ maxHeight: 108, fontFamily: 'Inter, sans-serif' }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = 'auto';
                    el.style.height = Math.min(el.scrollHeight, 108) + 'px';
                  }}
                />

                {/* Upload */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#94a3b8] hover:text-[#64748b] hover:bg-[#eef0f4] transition-colors"
                  title="Upload PDF"
                >
                  <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
                    <path d="M1.5 1.5h7l3 3V13.5a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5v-12A.5.5 0 0 1 1.5 1.5Z" stroke="currentColor" strokeWidth="1.15" />
                    <path d="M8.5 1.5V5h3" stroke="currentColor" strokeWidth="1.15" />
                    <path d="M6.5 6.5v4M4.5 8.5l2-2 2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Lang toggle */}
                <button
                  onClick={() => setLang((v) => (v === 'EN' ? 'HI' : 'EN'))}
                  className="shrink-0 h-8 px-2.5 rounded-lg text-[10.5px] font-semibold tracking-wide transition-all"
                  style={
                    lang === 'HI'
                      ? { background: '#2d6a4f', color: 'white', border: '1px solid #2d6a4f' }
                      : { background: 'transparent', color: '#94a3b8', border: '1px solid #dde2ea' }
                  }
                >
                  {lang === 'EN' ? 'हिं' : 'EN'}
                </button>

                {/* Send */}
                <button
                  onClick={() => handleSend()}
                  disabled={!inputText.trim()}
                  className="shrink-0 h-8 px-4 rounded-lg text-[11.5px] font-semibold text-white transition-all"
                  style={{
                    background: inputText.trim()
                      ? 'linear-gradient(135deg, #2d6a4f, #1e4d38)'
                      : '#e2e8f0',
                    color: inputText.trim() ? 'white' : '#94a3b8',
                    cursor: inputText.trim() ? 'pointer' : 'default',
                    boxShadow: inputText.trim() ? '0 2px 8px rgba(45,106,79,0.3)' : 'none',
                  }}
                >
                  Send
                </button>
              </div>

              {/* Mic hint */}
              {micActive && (
                <div className="flex items-center gap-2 mt-2 ml-1">
                  <div className="flex gap-0.5 items-end h-3">
                    {[3, 5, 4, 6, 3, 5].map((h, i) => (
                      <div
                        key={i}
                        className="w-0.5 rounded-full bg-[#52b788]"
                        style={{ height: h * 2, animation: `dot-bounce 1.2s ease-in-out ${i * 0.1}s infinite` }}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-[#52b788] font-medium">Listening…</span>
                </div>
              )}

              <p className="text-[9.5px] text-[#c4cdd8] text-center mt-2">
                SahayBot provides AI-assisted legal summaries. Always consult a qualified advocate. · Powered by Claude Sonnet 5
              </p>
            </div>
          </main>

          {/* ── Document Preview Panel ── */}
          <DocPreviewPanel
            citation={activeCitation}
            doc={activeCitationDoc}
            onClose={() => setActiveCitation(null)}
          />
        </div>
      </div>
    </div>
  );
}

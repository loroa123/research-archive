import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { Tag as TagIcon, Clock, ExternalLink } from 'lucide-react'
import { SOURCE_LABEL, VERDICT_LABEL, tagClass, ago, type NoteMeta } from '../lib/api'

export function TagPill({ tag, active, onClick }: { tag: string; active?: boolean; onClick?: () => void }) {
  const base = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-5'
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      onClick={onClick}
      className={`${base} ${tagClass(tag)} ${onClick ? 'cursor-pointer hover:opacity-80' : ''} ${active ? 'ring-2 ring-accent' : ''}`}
    >
      {tag}
    </Comp>
  )
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const v = VERDICT_LABEL[verdict]
  if (!v) return null
  return <span className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ${v.cls}`}>{v.text}</span>
}

export function StatusBadge({ status }: { status: string }) {
  const deep = status === 'deep'
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-xs ${
        deep ? 'border-accent/40 text-accent' : 'border-line text-fg-muted'
      }`}
    >
      {deep ? '深入' : '简略'}
    </span>
  )
}

export function NoteCard({ note }: { note: NoteMeta }) {
  return (
    <Link
      to={`/note/${note.id}`}
      className="group flex flex-col rounded-xl border border-line bg-card p-5 transition hover:border-accent/50 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug group-hover:text-accent">{note.title}</h3>
        <VerdictBadge verdict={note.verdict} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-fg-muted">
        <span>{SOURCE_LABEL[note.source] || note.source}</span>
        {note.author && <span className="truncate">· {note.author.split(',')[0]}{note.author.includes(',') ? ' 等' : ''}</span>}
      </div>
      <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-fg-muted">{note.summary || '（暂无摘要）'}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {note.tags.slice(0, 4).map((t) => (
          <TagPill key={t} tag={t} />
        ))}
        {note.tags.length > 4 && <span className="text-xs text-fg-muted">+{note.tags.length - 4}</span>}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-fg-muted">
        <span className="flex items-center gap-1">
          <Clock size={12} /> {ago(note.captured)}
        </span>
        <StatusBadge status={note.status} />
      </div>
    </Link>
  )
}

export function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-fg-muted">{hint}</div>}
    </div>
  )
}

export function ExternalLinkBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-bg-muted"
    >
      <ExternalLink size={14} /> {children}
    </a>
  )
}

/** 行内 markdown（加粗、行内代码），用于画像字段等短文本 */
export function InlineMd({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <span>{children}</span>,
        code: ({ children }) => (
          <code className="rounded border border-line bg-bg-muted px-1 py-0.5 text-[0.85em]">{children}</code>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-fg-muted">{children}</div>
}

export { TagIcon }

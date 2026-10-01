import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Tag as TagIcon, Clock, ExternalLink } from 'lucide-react'
import { SOURCE_LABEL, VERDICT_LABEL, tagClass, ago, apiWrite, categoryColor, type Category, type NoteMeta } from '../lib/api'

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

export function CategoryChip({ name, categories }: { name: string; categories: Category[] }) {
  const c = categoryColor(name, categories)
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs ${c.chip}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** 给一条笔记选分类。选择后立即写入笔记的 frontmatter */
export function CategorySelect({
  note,
  categories,
  onChanged,
  className = '',
}: {
  note: NoteMeta
  categories: Category[]
  onChanged: () => void
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // 笔记里的分类不在清单里（未登记）时也要能显示当前值
  const options = categories.some((c) => c.name === note.category) || !note.category ? categories : [...categories, { name: note.category, color: 'zinc', count: 0, registered: false }]
  return (
    <span className="inline-flex flex-col">
      <select
        value={note.category}
        disabled={busy}
        aria-label="归入分类"
        onChange={async (e) => {
          setBusy(true)
          setErr('')
          try {
            await apiWrite('PATCH', '/api/note', { id: note.id, category: e.target.value || null })
            onChanged()
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x))
          } finally {
            setBusy(false)
          }
        }}
        className={`h-8 max-w-full rounded-md border border-line bg-card px-2 text-xs outline-none focus:ring-2 focus:ring-[var(--ring)] ${className}`}
      >
        <option value="">未分类</option>
        {options.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
          </option>
        ))}
      </select>
      {err && <span className="mt-1 text-xs text-rose-600">{err}</span>}
    </span>
  )
}

export function NoteCard({ note, categories, onChanged }: { note: NoteMeta; categories: Category[]; onChanged: () => void }) {
  const navigate = useNavigate()
  // 整张卡片可点击进入详情；卡片里的交互控件（选择器、链接）不触发
  const open = (e: React.MouseEvent | React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('a,button,select,option,[data-no-nav]')) return
    navigate(`/note/${note.id}`)
  }
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === 'Enter' && open(e)}
      className="group flex cursor-pointer flex-col rounded-xl border border-line bg-card p-5 outline-none transition hover:border-accent/50 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug group-hover:text-accent">
          <Link to={`/note/${note.id}`}>{note.title}</Link>
        </h3>
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
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-fg-muted" data-no-nav>
        <CategorySelect note={note} categories={categories} onChanged={onChanged} className="w-[9.5rem] text-fg" />
        <span className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1">
            <Clock size={12} /> {ago(note.captured)}
          </span>
          <StatusBadge status={note.status} />
        </span>
      </div>
    </div>
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

/** 只放行 http/https。笔记 frontmatter 里的 url 不可信，javascript:、data: 等协议点击会执行脚本 */
export function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function ExternalLinkBtn({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = safeHttpUrl(href)
  if (!safe) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-fg-muted" title={href}>
        <ExternalLink size={14} /> 链接协议不受支持，已禁用
      </span>
    )
  }
  return (
    <a
      href={safe}
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

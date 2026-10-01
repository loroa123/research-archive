import { useMemo, useState } from 'react'
import { BookOpen, Search, Layers, Microscope, Gauge, Settings2 } from 'lucide-react'
import { useApi, SOURCE_LABEL, VERDICT_LABEL, CATEGORY_COLORS, type NoteMeta, type CategoriesResp } from '../lib/api'
import { NoteCard, StatCard, TagPill, Empty } from '../components/ui'
import CategoryManager from '../components/CategoryManager'

const selectCls =
  'h-10 rounded-lg border border-line bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]'

export default function LibraryPage() {
  const { data, error, loading, reload: reloadNotes } = useApi<{ root: string; notes: NoteMeta[] }>('/api/notes')
  const { data: catData, reload: reloadCats } = useApi<CategoriesResp>('/api/categories')
  const [category, setCategory] = useState('') // '' 全部；'__none__' 未分类；其余为分类名
  const [managing, setManaging] = useState(false)
  const reloadAll = () => {
    reloadNotes()
    reloadCats()
  }
  const categories = catData?.categories ?? []
  const [q, setQ] = useState('')
  const [source, setSource] = useState('')
  const [verdict, setVerdict] = useState('')
  const [status, setStatus] = useState('')
  const [tag, setTag] = useState('')

  const notes = data?.notes ?? []
  const hotTags = useMemo(() => {
    const c = new Map<string, number>()
    notes.forEach((n) => n.tags.forEach((t) => c.set(t, (c.get(t) || 0) + 1)))
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  }, [notes])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return notes.filter(
      (n) =>
        (!category || (category === '__none__' ? !n.category : n.category === category)) &&
        (!source || n.source === source) &&
        (!verdict || n.verdict === verdict) &&
        (!status || n.status === status) &&
        (!tag || n.tags.includes(tag)) &&
        (!k || `${n.title} ${n.summary} ${n.author} ${n.tags.join(' ')}`.toLowerCase().includes(k)),
    )
  }, [notes, q, category, source, verdict, status, tag])

  const sources = [...new Set(notes.map((n) => n.source))]
  const quickCount = notes.filter((n) => n.status !== 'deep').length

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="flex items-center gap-3">
        <BookOpen className="text-accent" size={28} />
        <h1 className="text-3xl font-bold">研究库</h1>
      </div>
      <p className="mt-2 text-fg-muted">看到的感兴趣的工作：GitHub / 论文 / 网页 / 视频等。点击卡片查看笔记。</p>

      {error && <div className="mt-6"><Empty>读取失败：{error}。请确认库根路径配置正确。</Empty></div>}
      {loading && <div className="mt-6 text-sm text-fg-muted">加载中…</div>}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={<Layers size={13} />} label="全部条目" value={notes.length} hint={`来源 ${sources.length} 类`} />
            <StatCard icon={<Gauge size={13} />} label="仅简略分析" value={<span className="text-sky-600">{quickCount}</span>} hint="还没读过源码或全文" />
            <StatCard icon={<Microscope size={13} />} label="已深入" value={<span className="text-violet-600">{notes.length - quickCount}</span>} hint="读过源码或全文" />
            <StatCard
              icon={<BookOpen size={13} />}
              label="值得用 / 参考"
              value={<span className="text-emerald-600">{notes.filter((n) => n.verdict === 'use' || n.verdict === 'reference').length}</span>}
              hint="verdict 为直接用或参考"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="分类">
            <CatTab active={category === ''} onClick={() => setCategory('')} label="全部" count={notes.length} />
            <CatTab active={category === '__none__'} onClick={() => setCategory('__none__')} label="未分类" count={catData?.uncategorized ?? 0} />
            {categories.map((c) => (
              <CatTab
                key={c.name}
                active={category === c.name}
                onClick={() => setCategory(c.name)}
                label={c.name}
                count={c.count}
                dot={(CATEGORY_COLORS[c.color] || CATEGORY_COLORS.zinc).dot}
              />
            ))}
            <button
              onClick={() => setManaging(true)}
              className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-line px-3 text-sm text-fg-muted hover:border-accent hover:text-accent"
            >
              <Settings2 size={14} /> 管理分类
            </button>
          </div>

          {hotTags.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-muted">热门标签：</span>
              {hotTags.map(([t, n]) => (
                <TagPill key={t} tag={`${t} ${n}`} active={tag === t} onClick={() => setTag(tag === t ? '' : t)} />
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-3 text-fg-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索标题 / 摘要 / 作者 / 标签…"
                className={`${selectCls} w-full pl-9`}
              />
            </div>
            <select className={selectCls} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">全部来源</option>
              {sources.map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>
              ))}
            </select>
            <select className={selectCls} value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="">全部结论</option>
              {Object.entries(VERDICT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v.text}</option>
              ))}
            </select>
            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">全部深度</option>
              <option value="quick">简略</option>
              <option value="deep">深入</option>
            </select>
          </div>

          <div className="mt-3 text-sm text-fg-muted">
            共 <b className="text-fg">{filtered.length}</b> 条
            {(q || source || verdict || status || tag || category) && (
              <button
                className="ml-3 text-accent hover:underline"
                onClick={() => { setQ(''); setSource(''); setVerdict(''); setStatus(''); setTag(''); setCategory('') }}
              >
                清除筛选
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-4"><Empty>没有符合条件的条目。</Empty></div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((n) => (
                <NoteCard key={n.id} note={n} categories={categories} onChanged={reloadAll} />
              ))}
            </div>
          )}
        </>
      )}
      {managing && (
        <CategoryManager
          categories={categories}
          onClose={() => setManaging(false)}
          onChanged={() => {
            reloadAll()
            // 当前选中的分类被改名或删除后，回到「全部」
            setCategory('')
          }}
        />
      )}
    </div>
  )
}

function CatTab({ active, onClick, label, count, dot }: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition ${
        active ? 'border-accent bg-accent-soft font-medium text-accent' : 'border-line hover:bg-bg-muted'
      }`}
    >
      {dot && <span className={`h-2 w-2 rounded-full ${dot}`} />}
      {label}
      <span className={`text-xs ${active ? 'text-accent' : 'text-fg-muted'}`}>{count}</span>
    </button>
  )
}

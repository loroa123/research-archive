import { useMemo, useState } from 'react'
import { BookOpen, Search, Layers, Microscope, Gauge, Settings2, Grid2X2, List, Eye, EyeOff } from 'lucide-react'
import { COMPLETED_TASK_STATUSES, initialShowCompletedTasks, rememberShowCompletedTasks, useApi, SOURCE_LABEL, VERDICT_LABEL, CATEGORY_COLORS, type NoteMeta, type CategoriesResp, type ResearchTask } from '../lib/api'
import { NoteCard, NoteListItem, StatCard, TagPill, Empty } from '../components/ui'
import CategoryManager from '../components/CategoryManager'

const selectCls =
  'h-10 rounded-lg border border-line bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]'

type ViewMode = 'card' | 'list'

function initialViewMode(): ViewMode {
  try {
    return localStorage.getItem('research-archive-view') === 'list' ? 'list' : 'card'
  } catch {
    return 'card'
  }
}

export default function LibraryPage() {
  const { data, error, loading, reload: reloadNotes } = useApi<{ root: string; notes: NoteMeta[] }>('/api/notes')
  const { data: catData, reload: reloadCats } = useApi<CategoriesResp>('/api/categories')
  const { data: taskData, error: taskError, loading: tasksLoading } = useApi<{ tasks: ResearchTask[] }>('/api/tasks')
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
  const [task, setTask] = useState('')
  const [showCompletedTasks, setShowCompletedTasks] = useState(initialShowCompletedTasks)
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)

  const chooseView = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem('research-archive-view', mode)
    } catch {
      // localStorage 被禁用时仍保留本次会话的选择。
    }
  }

  const notes = data?.notes ?? []
  const tasks = taskData?.tasks ?? []
  const completedTaskIds = useMemo(() => new Set(tasks.filter((item) => COMPLETED_TASK_STATUSES.has(item.status)).map((item) => item.id)), [tasks])
  const hiddenTaskNoteCount = notes.filter((note) => note.task && completedTaskIds.has(note.task)).length
  const visibleNotes = showCompletedTasks ? notes : notes.filter((note) => !note.task || !completedTaskIds.has(note.task))
  const chooseCompletedVisibility = (show: boolean) => {
    setShowCompletedTasks(show)
    rememberShowCompletedTasks(show)
    if (!show && task && completedTaskIds.has(task)) setTask('')
  }
  const hotTags = useMemo(() => {
    const c = new Map<string, number>()
    visibleNotes.forEach((n) => n.tags.forEach((t) => c.set(t, (c.get(t) || 0) + 1)))
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)
  }, [visibleNotes])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    return visibleNotes.filter(
      (n) =>
        (!category || (category === '__none__' ? !n.category : n.category === category)) &&
        (!source || n.source === source) &&
        (!verdict || n.verdict === verdict) &&
        (!status || n.status === status) &&
        (!tag || n.tags.includes(tag)) &&
        (!task || (task === '__none__' ? !n.task : n.task === task)) &&
        (!k || `${n.title} ${n.summary} ${n.author} ${n.tags.join(' ')}`.toLowerCase().includes(k)),
    )
  }, [visibleNotes, q, category, source, verdict, status, tag, task])

  const sources = [...new Set(visibleNotes.map((n) => n.source))]
  const quickCount = visibleNotes.filter((n) => n.status !== 'deep').length
  const categoryCount = (name: string) => visibleNotes.filter((note) => note.category === name).length
  const uncategorizedCount = visibleNotes.filter((note) => !note.category).length

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="flex items-center gap-3">
        <BookOpen className="text-accent" size={28} />
        <h1 className="text-3xl font-bold">研究库</h1>
      </div>
      <p className="mt-2 text-fg-muted">看到的感兴趣的工作：GitHub / 论文 / 网页 / 视频等。点击卡片查看笔记。</p>

      {(error || taskError) && <div className="mt-6"><Empty>读取失败：{error || taskError}。请确认库根路径配置正确。</Empty></div>}
      {(loading || tasksLoading) && <div className="mt-6 text-sm text-fg-muted">加载中…</div>}

      {data && taskData && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={<Layers size={13} />} label="当前条目" value={visibleNotes.length} hint={`来源 ${sources.length} 类`} />
            <StatCard icon={<Gauge size={13} />} label="仅简略分析" value={<span className="text-sky-600">{quickCount}</span>} hint="还没读过源码或全文" />
            <StatCard icon={<Microscope size={13} />} label="已深入" value={<span className="text-violet-600">{visibleNotes.length - quickCount}</span>} hint="读过源码或全文" />
            <StatCard
              icon={<BookOpen size={13} />}
              label="值得用 / 参考"
              value={<span className="text-emerald-600">{visibleNotes.filter((n) => n.verdict === 'use' || n.verdict === 'reference').length}</span>}
              hint="verdict 为直接用或参考"
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2" role="tablist" aria-label="分类">
            <CatTab active={category === ''} onClick={() => setCategory('')} label="全部" count={visibleNotes.length} />
            <CatTab active={category === '__none__'} onClick={() => setCategory('__none__')} label="未分类" count={uncategorizedCount} />
            {categories.map((c) => (
              <CatTab
                key={c.name}
                active={category === c.name}
                onClick={() => setCategory(c.name)}
                label={c.name}
                count={categoryCount(c.name)}
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
            <select className={selectCls} value={task} onChange={(e) => setTask(e.target.value)}>
              <option value="">全部短期任务</option>
              {tasks.filter((item) => showCompletedTasks || !COMPLETED_TASK_STATUSES.has(item.status)).map((item) => (
                <option key={item.id} value={item.id}>{item.title}{COMPLETED_TASK_STATUSES.has(item.status) ? '（已完成）' : ''}</option>
              ))}
              <option value="__none__">不属于任务</option>
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-fg-muted">
            <div>
              共 <b className="text-fg">{filtered.length}</b> 条
              {(q || source || verdict || status || tag || category || task) && (
                <button
                  className="ml-3 text-accent hover:underline"
                  onClick={() => { setQ(''); setSource(''); setVerdict(''); setStatus(''); setTag(''); setCategory(''); setTask('') }}
                >
                  清除筛选
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {completedTaskIds.size > 0 && (
                <button
                  type="button"
                  aria-pressed={showCompletedTasks}
                  onClick={() => chooseCompletedVisibility(!showCompletedTasks)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs hover:bg-bg-muted"
                >
                  {showCompletedTasks ? <EyeOff size={14} /> : <Eye size={14} />}
                  {showCompletedTasks ? '隐藏已完成任务资料' : `显示已完成任务资料（${hiddenTaskNoteCount}）`}
                </button>
              )}
              <div className="inline-flex rounded-lg border border-line bg-card p-0.5" role="group" aria-label="展示方式">
                <ViewButton active={viewMode === 'card'} onClick={() => chooseView('card')} icon={<Grid2X2 size={14} />} label="卡片" />
                <ViewButton active={viewMode === 'list'} onClick={() => chooseView('list')} icon={<List size={15} />} label="列表" />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-4"><Empty>没有符合条件的条目。</Empty></div>
          ) : (
            viewMode === 'card' ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((n) => (
                  <NoteCard key={n.id} note={n} categories={categories} tasks={tasks} onChanged={reloadAll} />
                ))}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {filtered.map((n) => (
                  <NoteListItem key={n.id} note={n} categories={categories} tasks={tasks} onChanged={reloadAll} />
                ))}
              </div>
            )
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

function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition ${
        active ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-bg-muted'
      }`}
    >
      {icon} {label}
    </button>
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

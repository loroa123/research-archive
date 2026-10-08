import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDot, Eye, EyeOff, ListTodo, RotateCcw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Empty } from '../components/ui'
import { apiWrite, COMPLETED_TASK_STATUSES, initialShowCompletedTasks, rememberShowCompletedTasks, useApi, type ResearchTask } from '../lib/api'

const STATUS: Record<string, string> = { active: '进行中', done: '已完成', archived: '已归档' }

export default function TasksPage() {
  const { data, error, loading, reload } = useApi<{ tasks: ResearchTask[] }>('/api/tasks')
  const [showCompleted, setShowCompleted] = useState(initialShowCompletedTasks)
  const [saving, setSaving] = useState('')
  const [writeError, setWriteError] = useState('')
  const tasks = data?.tasks ?? []
  const completed = useMemo(() => tasks.filter((task) => COMPLETED_TASK_STATUSES.has(task.status)), [tasks])
  const visible = showCompleted ? tasks : tasks.filter((task) => !COMPLETED_TASK_STATUSES.has(task.status))
  const chooseCompletedVisibility = (show: boolean) => {
    setShowCompleted(show)
    rememberShowCompletedTasks(show)
  }
  const changeStatus = async (task: ResearchTask) => {
    const next = COMPLETED_TASK_STATUSES.has(task.status) ? 'active' : 'done'
    setSaving(task.id)
    setWriteError('')
    try {
      await apiWrite('PATCH', '/api/tasks', { id: task.id, status: next })
      reload()
    } catch (e) {
      setWriteError(e instanceof Error ? e.message : '更新失败')
    } finally {
      setSaving('')
    }
  }
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="flex items-center gap-3"><ListTodo className="text-accent" size={28} /><h1 className="text-3xl font-bold">任务</h1></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-fg-muted">任务是有结束条件的短期工作；长期关心的方向仍放在「项目画像」。</p>
        {completed.length > 0 && (
          <button
            type="button"
            aria-pressed={showCompleted}
            onClick={() => chooseCompletedVisibility(!showCompleted)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-card px-3 text-sm hover:bg-bg-muted"
          >
            {showCompleted ? <EyeOff size={15} /> : <Eye size={15} />}
            {showCompleted ? '隐藏已完成任务' : `显示已完成任务（${completed.length}）`}
          </button>
        )}
      </div>
      {loading && <div className="mt-6 text-sm text-fg-muted">加载中…</div>}
      {error && <div className="mt-6"><Empty>读取失败：{error}</Empty></div>}
      {writeError && <div className="mt-6"><Empty>更新失败：{writeError}</Empty></div>}
      {data && tasks.length === 0 && <div className="mt-6"><Empty>还没有任务。</Empty></div>}
      {data && tasks.length > 0 && visible.length === 0 && <div className="mt-6"><Empty>进行中的任务已经全部完成。点击“显示已完成任务”可统一展开。</Empty></div>}
      <div className="mt-6 space-y-5">
        {visible.map((task) => (
          <article key={task.id} className="rounded-xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="text-xl font-semibold">{task.title}</h2><p className="mt-1 text-sm text-fg-muted">{task.summary}</p></div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 rounded-md bg-sky-100 px-2 py-1 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  {COMPLETED_TASK_STATUSES.has(task.status) ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}{STATUS[task.status] || task.status}
                </span>
                <button
                  type="button"
                  disabled={saving === task.id}
                  onClick={() => changeStatus(task)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs hover:bg-bg-muted disabled:opacity-50"
                >
                  {COMPLETED_TASK_STATUSES.has(task.status) ? <RotateCcw size={13} /> : <CheckCircle2 size={13} />}
                  {saving === task.id ? '保存中…' : COMPLETED_TASK_STATUSES.has(task.status) ? '重新启用' : '标为已完成'}
                </button>
              </div>
            </div>
            <div className="prose prose-sm mt-5 max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{task.body}</ReactMarkdown></div>
            <div className="mt-5 border-t border-line pt-3">
              <div className="text-xs text-fg-muted">相关研究笔记（{task.related.length}）</div>
              <ul className="mt-2 space-y-1 text-sm">{task.related.map((note) => <li key={note.id}><Link className="text-accent hover:underline" to={`/note/${note.id}`}>{note.title}</Link></li>)}</ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

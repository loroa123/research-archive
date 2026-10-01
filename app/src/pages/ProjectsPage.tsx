import { Link } from 'react-router-dom'
import { FolderKanban, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { useApi, type Project } from '../lib/api'
import { Empty, InlineMd } from '../components/ui'

const SHOWN = ['在做什么', '当前关心的问题', '关键词', '路径']

export default function ProjectsPage() {
  const { data, error, loading } = useApi<{ projects: Project[] }>('/api/projects')
  const projects = data?.projects ?? []

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <div className="flex items-center gap-3">
        <FolderKanban className="text-accent" size={28} />
        <h1 className="text-3xl font-bold">项目画像</h1>
      </div>
      <p className="mt-2 text-fg-muted">
        笔记里的「和我的场景的关系」只对照这里的项目。核实状态为「来源摘要」表示还没读过项目内容。
      </p>

      {loading && <div className="mt-6 text-sm text-fg-muted">加载中…</div>}
      {error && <div className="mt-6"><Empty>读取失败：{error}</Empty></div>}
      {data && projects.length === 0 && (
        <div className="mt-6"><Empty>还没有项目画像。对 Claude 说「加到关心的项目里」即可添加。</Empty></div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {projects.map((p) => {
          const verified = (p.fields['核实状态'] || '').startsWith('已读')
          return (
            <div key={p.title} className="flex flex-col rounded-xl border border-line bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{p.title}</h2>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs ${
                    verified
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {verified ? <ShieldCheck size={12} /> : <ShieldQuestion size={12} />}
                  {verified ? '已读' : '来源摘要'}
                </span>
              </div>
              <dl className="mt-3 space-y-2 text-sm">
                {SHOWN.filter((k) => p.fields[k]).map((k) => (
                  <div key={k}>
                    <dt className="text-xs text-fg-muted">{k}</dt>
                    <dd className="leading-relaxed"><InlineMd text={p.fields[k]} /></dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-line pt-3">
                <div className="text-xs text-fg-muted">提到它的笔记（{p.related.length}）</div>
                {p.related.length === 0 ? (
                  <div className="mt-1 text-sm text-fg-muted">暂无</div>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm">
                    {p.related.map((r) => (
                      <li key={r.id}>
                        <Link to={`/note/${r.id}`} className="text-accent hover:underline">{r.title}</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

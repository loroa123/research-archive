import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft } from 'lucide-react'
import { useApi, SOURCE_LABEL, type NoteDetail, type CategoriesResp } from '../lib/api'
import { TagPill, VerdictBadge, StatusBadge, ExternalLinkBtn, Empty, CategorySelect } from '../components/ui'

export default function DetailPage() {
  const { source = '', name = '' } = useParams()
  const id = `${source}/${name}`
  const { data, error, loading, reload } = useApi<NoteDetail>(`/api/note?id=${encodeURIComponent(id)}`)
  const { data: catData, reload: reloadCats } = useApi<CategoriesResp>('/api/categories')
  const m = data?.meta

  return (
    <div className="mx-auto max-w-[860px] px-6 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-accent">
        <ArrowLeft size={14} /> 返回研究库
      </Link>

      {loading && <div className="mt-6 text-sm text-fg-muted">加载中…</div>}
      {error && <div className="mt-6"><Empty>找不到这条笔记。</Empty></div>}

      {data && (
        <>
          {m && (
            <div className="mt-4 rounded-xl border border-line bg-card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-bg-muted px-2 py-0.5 text-xs">{SOURCE_LABEL[m.source] || m.source}</span>
                <VerdictBadge verdict={m.verdict} />
                <StatusBadge status={m.status} />
                {m.captured && <span className="text-xs text-fg-muted">归档于 {m.captured}</span>}
                {m.published && <span className="text-xs text-fg-muted">发布于 {m.published}</span>}
              </div>
              {m.author && <div className="mt-2 text-sm text-fg-muted">{m.author}</div>}
              {m.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.tags.map((t) => <TagPill key={t} tag={t} />)}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {m.url && <ExternalLinkBtn href={m.url}>打开原链接</ExternalLinkBtn>}
                <span className="flex items-center gap-2 text-sm text-fg-muted">
                  分类
                  <CategorySelect
                    note={m}
                    categories={catData?.categories ?? []}
                    onChanged={() => {
                      reload()
                      reloadCats()
                    }}
                    className="h-9 w-48 text-sm text-fg"
                  />
                </span>
              </div>
            </div>
          )}
          <article className="prose-note mt-6">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // 不自动加载外部图片：避免每次打开笔记都向外部站点暴露访问；链接另开标签并断开 opener
                img: ({ alt }) => <span className="text-fg-muted">[图片：{alt || '未命名'}]</span>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer noopener">
                    {children}
                  </a>
                ),
              }}
            >
              {data.body}
            </ReactMarkdown>
          </article>
        </>
      )}
    </div>
  )
}

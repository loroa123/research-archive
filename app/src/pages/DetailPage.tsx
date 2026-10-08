import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Clock3, FileText, Film, ImageIcon, ListTree, MessagesSquare, Play, Save, Trash2, Upload, X, ZoomIn } from 'lucide-react'
import { apiWrite, useApi, SOURCE_LABEL, type NoteDetail, type CategoriesResp, type MeetingTranscript, type NoteVideo, type ResearchTask } from '../lib/api'
import { parseNoteBody, type MarkdownSection } from '../lib/noteContent'
import { TagPill, VerdictBadge, StatusBadge, ExternalLinkBtn, Empty, CategorySelect, TaskSelect } from '../components/ui'

const markdownComponents = {
  // 不自动加载外部图片：避免每次打开笔记都向外部站点暴露访问。
  img: ({ alt }: { alt?: string }) => <span className="text-fg-muted">[图片：{alt || '未命名'}]</span>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    const internal = href?.startsWith('#')
    return (
      <a href={href} target={internal ? undefined : '_blank'} rel={internal ? undefined : 'noreferrer noopener'}>
        {children}
      </a>
    )
  },
}

function MarkdownSections({ sections }: { sections: MarkdownSection[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <Fragment key={`${section.id || 'intro'}-${index}`}>
          {section.level === 2 && <h2 id={section.id}>{section.title}</h2>}
          {section.level === 3 && <h3 id={section.id}>{section.title}</h3>}
          {section.body && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {section.body}
            </ReactMarkdown>
          )}
        </Fragment>
      ))}
    </>
  )
}

function timestamp(seconds: number) {
  const value = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(value / 60)
  const rest = value % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function MeetingTranscriptView({ meeting, noteId }: { meeting: MeetingTranscript; noteId: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const seek = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = seconds
    void audio.play()
  }
  return (
    <details id="完整会谈文字" className="mt-10 scroll-mt-8 rounded-xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold"><MessagesSquare size={18} className="text-accent" />完整会谈文字</span>
        <span className="text-xs text-fg-muted">{meeting.turns.length} 段 · {timestamp(meeting.duration)} · 点击展开</span>
      </summary>
      <div className="border-t border-line px-5 pb-6 sm:px-6">
        <audio ref={audioRef} controls preload="metadata" className="sticky top-3 z-10 mt-4 w-full" src={`/api/meeting-audio?id=${encodeURIComponent(noteId)}`}>
          浏览器不支持音频播放。
        </audio>
        <p className="mt-3 text-xs leading-5 text-fg-muted">点击任一时间即可跳到原音频并播放。说话人由本地模型自动分离，姓名按已确认声纹映射，仍可能有少量错分。</p>
        <ol className="mt-4 space-y-1">
          {meeting.turns.map((turn, index) => (
            <li key={`${turn.start}-${index}`} className="group grid grid-cols-[4.5rem_5rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-2 hover:bg-bg-muted">
              <button type="button" onClick={() => seek(turn.start)} className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline" title={`从 ${timestamp(turn.start)} 播放`}>
                <Play size={11} fill="currentColor" />{timestamp(turn.start)}
              </button>
              <span className="truncate text-sm font-medium" title={turn.speaker}>{turn.speaker}</span>
              <span className="text-sm leading-6 text-fg">{turn.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}

function percent(value: number | null) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`
}

function VideoCaseView({ video, noteId, onChanged }: { video: NoteVideo; noteId: string; onChanged: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const seek = (seconds: number) => {
    const player = videoRef.current
    if (!player) return
    player.currentTime = seconds
    void player.play()
  }
  useEffect(() => {
    if (preview == null) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [preview])
  const removeLocalVideo = async () => {
    if (!window.confirm('确认删除本地视频副本？原帖地址、字幕、关键帧和分析会保留，但视频文件本身不会进入回收站。以后需要从来源页面重新抓取。')) return
    setRemoving(true); setRemoveError('')
    try {
      await apiWrite('DELETE', `/api/note-video?id=${encodeURIComponent(noteId)}`)
      onChanged()
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : '删除失败')
    } finally {
      setRemoving(false)
    }
  }
  const comparison = video.comparison
  return (
    <details id="视频材料与实验" className="mt-6 scroll-mt-8 overflow-hidden rounded-xl border border-line bg-card">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold"><Film size={18} className="text-accent" />视频材料与实验</span>
        <span className="text-xs text-fg-muted">{timestamp(video.duration)} · {video.segments.length} 段连续发言（原字幕 {video.cueCount} 段）</span>
      </summary>
      <div className="space-y-5 border-t border-line p-4 sm:p-6">
        {video.available ? (
          <video ref={videoRef} controls preload="metadata" poster={video.keyframes.length ? `/api/video-keyframe?id=${encodeURIComponent(noteId)}&index=0` : undefined} className="aspect-video w-full rounded-lg bg-black" src={`/api/note-video?id=${encodeURIComponent(noteId)}`}>
            浏览器不支持视频播放。
          </video>
        ) : (
          <div className="rounded-lg border border-dashed border-line bg-bg-muted px-4 py-10 text-center text-sm text-fg-muted">本地视频副本已删除；字幕、关键帧和分析仍然可用。</div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <span className="rounded-md bg-bg-muted px-2 py-1">文字来源：{video.sourceLabel}</span>
          {video.available && <span>网页播放使用 H.264 兼容副本；原始 HEVC 文件仍单独保留。</span>}
          {video.sourceUrl && <a href={video.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">重新抓取来源</a>}
          {video.available && <button type="button" disabled={removing} onClick={() => void removeLocalVideo()} className="ml-auto inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-50"><Trash2 size={12} />{removing ? '删除中…' : '删除本地视频'}</button>}
          {removeError && <span className="w-full text-red-600">{removeError}</span>}
        </div>

        {comparison && (
          <div>
            <h3 className="text-sm font-semibold">三来源全程对比</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                ['平台字幕 vs 本地 MLX', percent(comparison.platformVsLocal), comparison.localRuntime == null ? '' : `本地 ${comparison.localRuntime.toFixed(2)} 秒`],
                ['平台字幕 vs Qwen', percent(comparison.platformVsQwen), comparison.qwenRuntime == null ? '' : `Qwen ${comparison.qwenRuntime.toFixed(2)} 秒`],
                ['本地 MLX vs Qwen', percent(comparison.localVsQwen), comparison.qwenTokens == null ? '' : `${comparison.qwenTokens.toLocaleString()} tokens`],
              ].map(([label, value, detail]) => (
                <div key={label} className="rounded-lg border border-line bg-bg-muted p-3">
                  <div className="text-xs text-fg-muted">{label}</div>
                  <div className="mt-1 text-xl font-semibold text-fg">{value}</div>
                  {detail && <div className="mt-1 text-xs text-fg-muted">{detail}</div>}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-fg-muted">最终保留平台字幕时间轴并局部校正，共修改 {comparison.correctionCount} 个字幕段；原字幕和两路 ASR 均单独保留。</p>
          </div>
        )}

        {video.keyframes.length > 0 && (
          <details className="rounded-lg border border-line bg-bg-muted/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold"><ImageIcon size={16} className="text-accent" />画面关键帧</span>
              <span className="text-xs text-fg-muted">{video.keyframes.length} 张 · 场景变化优先{video.maxGapSeconds ? ` · 最长 ${video.maxGapSeconds} 秒补帧` : ''}</span>
            </summary>
            <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-3">
              {video.keyframes.map((frame) => (
                <figure key={frame.name} className="overflow-hidden rounded-lg border border-line bg-card">
                  <button type="button" onClick={() => setPreview(frame.index)} className="group relative block w-full cursor-zoom-in" title="点击放大查看">
                    <img loading="lazy" src={`/api/video-keyframe?id=${encodeURIComponent(noteId)}&index=${frame.index}`} alt={`${timestamp(frame.time)} 视频关键帧`} className="aspect-video h-auto w-full object-cover" />
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn size={13} />放大</span>
                  </button>
                  <figcaption className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-fg-muted">
                    <span>来源：视频关键帧</span>
                    <button type="button" onClick={() => seek(frame.time)} className="inline-flex items-center gap-1 font-mono text-accent hover:underline"><Play size={11} fill="currentColor" />{timestamp(frame.time)}</button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </details>
        )}

        <details className="rounded-lg border border-line bg-bg-muted/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold"><FileText size={16} className="text-accent" />完整连续文字</span>
            <span className="text-xs text-fg-muted">{video.segments.length} 段 · 已区分说话人 · 点击时间跳播</span>
          </summary>
          <ol className="max-h-[36rem] space-y-1 overflow-y-auto border-t border-line p-3">
            {video.segments.map((cue, index) => (
              <li key={`${cue.start}-${index}`} className="grid grid-cols-[4.5rem_5rem_minmax(0,1fr)] gap-2 rounded-lg px-2 py-2 hover:bg-card">
                <button type="button" onClick={() => seek(cue.start)} className="inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline"><Play size={11} fill="currentColor" />{timestamp(cue.start)}</button>
                <span className="text-sm font-medium text-fg-muted">{cue.speaker}</span>
                <span className="text-sm leading-6 text-fg">{cue.text}</span>
              </li>
            ))}
          </ol>
        </details>
      </div>
      {preview != null && video.keyframes[preview] && (
        <div role="dialog" aria-modal="true" aria-label="视频关键帧大图" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={() => setPreview(null)}>
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between pb-3 text-sm text-white">
            <span>{timestamp(video.keyframes[preview].time)} · 来源：视频关键帧</span>
            <button type="button" onClick={() => setPreview(null)} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"><X size={16} />关闭</button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto text-center" onClick={(event) => event.stopPropagation()}>
            <img src={`/api/video-keyframe?id=${encodeURIComponent(noteId)}&index=${preview}`} alt="视频关键帧大图" className="mx-auto max-w-none rounded-lg bg-white shadow-2xl" />
          </div>
        </div>
      )}
    </details>
  )
}

function NoteImageGallery({ images, noteId, onChanged }: { images: { index: number; name: string; note: string; added: boolean }[]; noteId: string; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState('')
  const [preview, setPreview] = useState<{ name: string; index: number; added: boolean } | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    setDrafts(Object.fromEntries(images.map((item) => [item.name, item.note || ''])))
  }, [images])
  useEffect(() => {
    if (!preview) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [preview])
  if (!images.length) return null
  const saveNote = async (name: string) => {
    setBusy(`note:${name}`); setError('')
    try {
      await apiWrite('PATCH', '/api/note-image', { id: noteId, name, note: drafts[name] || '' })
      setEditing('')
      onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } finally { setBusy('') }
  }
  const remove = async (name: string) => {
    if (!window.confirm('确认从当前笔记移除这张图片？文件会移入可恢复目录，不会永久删除。')) return
    setBusy(`remove:${name}`); setError('')
    try {
      await apiWrite('DELETE', `/api/note-image?id=${encodeURIComponent(noteId)}&name=${encodeURIComponent(name)}`)
      onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : '移除失败') } finally { setBusy('') }
  }
  const upload = async (file?: File) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) { setError('图片不能超过 8MB'); return }
    setBusy('upload'); setError('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
      await apiWrite('POST', '/api/note-image', { id: noteId, filename: file.name, dataUrl })
      onChanged()
    } catch (e) { setError(e instanceof Error ? e.message : '上传失败') } finally { setBusy('') }
  }
  return (
    <details id="原始图文" className="mt-6 scroll-mt-8 rounded-xl border border-line bg-card">
      <summary className="cursor-pointer px-5 py-4 font-semibold sm:px-6">原始图文（{images.length} 张，点击展开管理）</summary>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-6">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm hover:bg-bg-muted">
          <Upload size={14} />{busy === 'upload' ? '上传中…' : '添加图片'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={!!busy} onChange={(e) => { void upload(e.target.files?.[0]); e.currentTarget.value = '' }} />
        </label>
        <span className="text-xs text-fg-muted">支持 PNG/JPEG/WEBP，单张不超过 8MB；移除可恢复。</span>
        {error && <span className="w-full text-sm text-red-600">{error}</span>}
      </div>
      <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2 sm:p-6">
        {images.map((item) => (
          <figure key={item.name} className="overflow-hidden rounded-lg border border-line bg-bg-muted">
            <button type="button" onClick={() => setPreview(item)} className="group relative block w-full cursor-zoom-in" title="点击放大查看">
              <img loading="lazy" src={`/api/note-image?id=${encodeURIComponent(noteId)}&name=${encodeURIComponent(item.name)}`} alt={`原图第 ${item.index + 1} 张`} className="h-auto w-full" />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn size={13} />放大</span>
            </button>
            <figcaption className="space-y-2 border-t border-line bg-card p-3">
              <div className="flex items-center justify-between text-xs text-fg-muted">
                <span>第 {item.index + 1} 张 · 来源：{item.added ? '人工添加' : '小红书原图'}</span>
                <button type="button" disabled={!!busy} onClick={() => void remove(item.name)} className="inline-flex items-center gap-1 text-red-600 hover:underline disabled:opacity-50"><Trash2 size={12} />移除</button>
              </div>
              {editing === item.name ? (
                <div className="space-y-2">
                  <textarea autoFocus value={drafts[item.name] ?? ''} onChange={(e) => setDrafts((x) => ({ ...x, [item.name]: e.target.value }))} maxLength={2000} rows={3} placeholder="给这张图片添加备注，例如：第 3 行数字待复核" className="w-full resize-y rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" />
                  <div className="flex gap-2">
                    <button type="button" disabled={!!busy || (drafts[item.name] ?? '') === (item.note || '')} onClick={() => void saveNote(item.name)} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs hover:bg-bg-muted disabled:opacity-40"><Save size={12} />{busy === `note:${item.name}` ? '保存中…' : '保存备注'}</button>
                    <button type="button" disabled={!!busy} onClick={() => { setDrafts((x) => ({ ...x, [item.name]: item.note || '' })); setEditing('') }} className="rounded-md px-2.5 py-1.5 text-xs text-fg-muted hover:bg-bg-muted">取消</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {item.note && <p className="whitespace-pre-wrap text-sm leading-5 text-fg">{item.note}</p>}
                  <button type="button" disabled={!!busy} onClick={() => setEditing(item.name)} className="text-xs text-accent hover:underline">{item.note ? '编辑备注' : '添加备注'}</button>
                </div>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      {preview && (
        <div role="dialog" aria-modal="true" aria-label={`第 ${preview.index + 1} 张大图`} className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={() => setPreview(null)}>
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between pb-3 text-sm text-white">
            <span>第 {preview.index + 1} 张 · 来源：{preview.added ? '人工添加' : '小红书原图'}</span>
            <button type="button" onClick={() => setPreview(null)} className="inline-flex items-center gap-1 rounded-md bg-white/10 px-3 py-2 hover:bg-white/20"><X size={16} />关闭</button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto text-center" onClick={(event) => event.stopPropagation()}>
            <img src={`/api/note-image?id=${encodeURIComponent(noteId)}&name=${encodeURIComponent(preview.name)}`} alt={`第 ${preview.index + 1} 张大图`} className="mx-auto max-w-none rounded-lg bg-white shadow-2xl" />
          </div>
        </div>
      )}
    </details>
  )
}

export default function DetailPage() {
  const { source = '', name = '' } = useParams()
  const id = `${source}/${name}`
  const { data, error, loading, reload } = useApi<NoteDetail>(`/api/note?id=${encodeURIComponent(id)}`)
  const { data: catData, reload: reloadCats } = useApi<CategoriesResp>('/api/categories')
  const { data: taskData, reload: reloadTasks } = useApi<{ tasks: ResearchTask[] }>('/api/tasks')
  const m = data?.meta
  const content = data ? parseNoteBody(data.body) : null

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-accent">
        <ArrowLeft size={14} /> 返回研究库
      </Link>

      {loading && <div className="mt-6 text-sm text-fg-muted">加载中…</div>}
      {error && <div className="mt-6"><Empty>找不到这条笔记。</Empty></div>}

      {data && (
        <div className="mt-4 xl:grid xl:grid-cols-[minmax(0,860px)_240px] xl:items-start xl:gap-10">
          <main className="min-w-0">
            {m && (
              <div className="rounded-xl border border-line bg-card p-5">
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
                  <span className="flex items-center gap-2 text-sm text-fg-muted">
                    短期任务
                    <TaskSelect
                      note={m}
                      tasks={taskData?.tasks ?? []}
                      onChanged={() => {
                        reload()
                        reloadTasks()
                      }}
                      className="h-9 w-48 text-sm text-fg"
                    />
                  </span>
                </div>
              </div>
            )}
            {content && (
              <>
                <NoteImageGallery images={data.images || []} noteId={id} onChanged={reload} />
                {data.video && <VideoCaseView video={data.video} noteId={id} onChanged={reload} />}
                <article className="prose-note mt-6">
                  <MarkdownSections sections={content.main} />
                </article>
                {data.meeting && <MeetingTranscriptView meeting={data.meeting} noteId={id} />}
                {content.hasFollowups && (
                  <section id={content.followupId} className="mt-10 scroll-mt-8 rounded-xl border border-line bg-bg-muted/60 p-5 sm:p-6">
                    <div className="flex items-center gap-2 border-b border-line pb-3">
                      <MessagesSquare size={18} className="text-accent" />
                      <h2 className="text-lg font-semibold">追问记录</h2>
                    </div>
                    <div className="prose-note followup-note">
                      <MarkdownSections sections={content.followups} />
                    </div>
                  </section>
                )}
              </>
            )}
          </main>

          {content && content.toc.length > 0 && (
            <aside className="sticky top-8 hidden xl:block">
              <nav aria-label="本页目录" className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ListTree size={16} className="text-accent" /> 目录
                </div>
                <ol className="mt-3 space-y-1.5 text-sm">
                  {data.video && (
                    <li>
                      <a href="#视频材料与实验" className="flex items-center gap-1.5 leading-5 text-fg-muted hover:text-accent">
                        <Film size={13} /> 视频材料与实验
                      </a>
                    </li>
                  )}
                  {content.toc.map((item) => (
                    <Fragment key={item.id}>
                      {data.meeting && item.id === content.followupId && (
                        <li>
                          <a href="#完整会谈文字" className="flex items-center gap-1.5 leading-5 text-fg-muted hover:text-accent">
                            <Clock3 size={13} /> 完整会谈文字
                          </a>
                        </li>
                      )}
                      <li className={item.level === 3 ? 'pl-3' : ''}>
                        <a href={`#${item.id}`} className="block leading-5 text-fg-muted hover:text-accent">
                          {item.title}
                        </a>
                      </li>
                    </Fragment>
                  ))}
                  {data.meeting && !content.hasFollowups && (
                    <li>
                      <a href="#完整会谈文字" className="flex items-center gap-1.5 leading-5 text-fg-muted hover:text-accent">
                        <Clock3 size={13} /> 完整会谈文字
                      </a>
                    </li>
                  )}
                </ol>
              </nav>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

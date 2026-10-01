import { useCallback, useEffect, useState } from 'react'

export interface NoteMeta {
  id: string
  source: string
  title: string
  url: string
  author: string
  captured: string
  published: string
  tags: string[]
  status: string
  verdict: string
  category: string
  summary: string
  mtime: number
}

export interface Project {
  name: string
  title: string
  fields: Record<string, string>
  related: { id: string; title: string }[]
}

export interface Category {
  name: string
  color: string
  count: number
  registered: boolean
}

export interface CategoriesResp {
  categories: Category[]
  uncategorized: number
  total: number
}

export interface NoteDetail {
  meta?: NoteMeta
  body: string
}

/** 极简数据获取：加载中 / 出错 / 数据 */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    // 重新加载（tick 变化）时保留旧数据，避免页面闪烁；换路径才清空
    if (tick === 0) {
      setData(null)
      setError(null)
    }
    fetch(path, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => alive && setData(d as T))
      .catch((e) => alive && setError(String(e.message || e)))
    return () => {
      alive = false
    }
  }, [path, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading: !data && !error, reload }
}

/** 写操作：带上服务端要求的写入标记头，失败时抛出服务端给的中文错误信息 */
export async function apiWrite(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-ra-write': '1' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `请求失败（${r.status}）`)
  return j
}

export const SOURCE_LABEL: Record<string, string> = {
  github: 'GitHub',
  arxiv: '论文',
  youtube: '视频',
  xhs: '小红书',
  wechat: '公众号',
  web: '网页',
}

export const VERDICT_LABEL: Record<string, { text: string; cls: string }> = {
  use: { text: '直接用', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  reference: { text: '参考', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  learn: { text: '学习', cls: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  skip: { text: '跳过', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
}

const TAG_PALETTE = [
  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900',
  'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900',
  'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900',
  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900',
  'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-900',
  'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
]

/** 同一个标签永远是同一个颜色 */
export function tagClass(tag: string) {
  let h = 0
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TAG_PALETTE[h % TAG_PALETTE.length]
}

export function ago(dateStr: string) {
  if (!dateStr) return ''
  const t = Date.parse(dateStr)
  if (Number.isNaN(t)) return dateStr
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return '今天'
  if (days < 30) return `${days} 天前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

/** 分类颜色：chip 是标签样式，dot 是色点。类名必须写全，Tailwind 才会生成 */
export const CATEGORY_COLORS: Record<string, { chip: string; dot: string; label: string }> = {
  sky: { chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900', dot: 'bg-sky-500', label: '蓝' },
  violet: { chip: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900', dot: 'bg-violet-500', label: '紫' },
  orange: { chip: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900', dot: 'bg-orange-500', label: '橙' },
  rose: { chip: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900', dot: 'bg-rose-500', label: '红' },
  teal: { chip: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-900', dot: 'bg-teal-500', label: '青' },
  amber: { chip: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900', dot: 'bg-amber-500', label: '黄' },
  emerald: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900', dot: 'bg-emerald-500', label: '绿' },
  zinc: { chip: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700', dot: 'bg-zinc-400', label: '灰' },
}

export function categoryColor(name: string, cats: Category[]) {
  const c = cats.find((x) => x.name === name)
  return CATEGORY_COLORS[c?.color || 'zinc'] || CATEGORY_COLORS.zinc
}

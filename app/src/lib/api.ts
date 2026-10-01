import { useEffect, useState } from 'react'

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
  summary: string
  mtime: number
}

export interface Project {
  name: string
  title: string
  fields: Record<string, string>
  related: { id: string; title: string }[]
}

export interface NoteDetail {
  meta?: NoteMeta
  body: string
}

/** 极简数据获取：加载中 / 出错 / 数据 */
export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setData(null)
    setError(null)
    fetch(path)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d) => alive && setData(d as T))
      .catch((e) => alive && setError(String(e.message || e)))
    return () => {
      alive = false
    }
  }, [path])
  return { data, error, loading: !data && !error }
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

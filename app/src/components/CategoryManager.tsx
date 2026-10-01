import { useState } from 'react'
import { Plus, Trash2, X, AlertTriangle } from 'lucide-react'
import { apiWrite, CATEGORY_COLORS, type Category } from '../lib/api'

/** 管理分类：新增、改名、换颜色、删除。每个操作立即写入，没有「保存」按钮 */
export default function CategoryManager({
  categories,
  onClose,
  onChanged,
}: {
  categories: Category[]
  onClose: () => void
  onChanged: () => void
}) {
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const add = () =>
    newName.trim() &&
    run(async () => {
      await apiWrite('POST', '/api/categories', { name: newName })
      setNewName('')
    })

  const remove = (c: Category) => {
    const msg =
      c.count > 0
        ? `删除分类「${c.name}」？\n\n其下 ${c.count} 条笔记会变成「未分类」（只清除笔记里的 category 一行，正文不动）。`
        : `删除分类「${c.name}」？`
    if (window.confirm(msg)) run(() => apiWrite('DELETE', `/api/categories?name=${encodeURIComponent(c.name)}`))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="管理分类"
    >
      <div className="w-full max-w-[520px] rounded-2xl border border-line bg-bg p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">管理分类</h2>
          <button onClick={onClose} className="rounded-md p-1 text-fg-muted hover:bg-bg-muted" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-fg-muted">改名会同步到相关笔记；删除只清除笔记里的分类字段。修改立即生效。</p>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <ul className="mt-4 max-h-[44vh] space-y-2 overflow-y-auto pr-1">
          {categories.length === 0 && <li className="py-6 text-center text-sm text-fg-muted">还没有分类，在下面添加第一个。</li>}
          {categories.map((c) => (
            <Row key={c.name} cat={c} busy={busy} run={run} onRemove={() => remove(c)} />
          ))}
        </ul>

        <div className="mt-4 flex gap-2 border-t border-line pt-4">
          <input
            value={newName}
            maxLength={30}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="新分类名，如 agent harness"
            className="h-10 flex-1 rounded-lg border border-line bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
          />
          <button
            onClick={add}
            disabled={busy || !newName.trim()}
            className="inline-flex h-10 items-center gap-1 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-40 dark:text-black"
          >
            <Plus size={15} /> 添加
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ cat, busy, run, onRemove }: { cat: Category; busy: boolean; run: (fn: () => Promise<unknown>) => void; onRemove: () => void }) {
  const [name, setName] = useState(cat.name)
  const [picking, setPicking] = useState(false)
  const dot = (CATEGORY_COLORS[cat.color] || CATEGORY_COLORS.zinc).dot

  const commit = () => {
    const v = name.trim()
    if (v && v !== cat.name) run(() => apiWrite('PATCH', '/api/categories', { name: cat.name, newName: v }))
    else setName(cat.name)
  }

  return (
    <li className="rounded-lg border border-line bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPicking(!picking)}
          className={`h-5 w-5 shrink-0 rounded-full ${dot} ring-offset-2 ring-offset-card hover:ring-2 hover:ring-accent`}
          aria-label="选择颜色"
          title="选择颜色"
        />
        <input
          value={name}
          maxLength={30}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setName(cat.name)
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm outline-none hover:border-line focus:border-line focus:ring-2 focus:ring-[var(--ring)]"
        />
        {!cat.registered && <span className="shrink-0 text-xs text-amber-600" title="只在笔记里出现，不在分类清单中">未登记</span>}
        <span className="w-12 shrink-0 text-right text-xs text-fg-muted">{cat.count} 条</span>
        <button onClick={onRemove} disabled={busy} className="rounded-md p-1.5 text-fg-muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" aria-label={`删除 ${cat.name}`}>
          <Trash2 size={15} />
        </button>
      </div>
      {picking && (
        <div className="mt-2 flex flex-wrap gap-2 pl-7">
          {Object.entries(CATEGORY_COLORS).map(([k, v]) => (
            <button
              key={k}
              title={v.label}
              onClick={() => {
                setPicking(false)
                run(() => apiWrite('PATCH', '/api/categories', { name: cat.name, color: k }))
              }}
              className={`h-6 w-6 rounded-full ${v.dot} ${cat.color === k ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''}`}
              aria-label={v.label}
            />
          ))}
        </div>
      )}
    </li>
  )
}

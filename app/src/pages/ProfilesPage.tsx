import { useMemo, useState } from 'react'
import { BookText, Check, Edit3, Mic2, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { apiWrite, useApi, type TerminologyItem, type VoiceprintProfile } from '../lib/api'
import { Empty } from '../components/ui'

const inputCls = 'h-10 w-full rounded-lg border border-line bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]'
const textAreaCls = 'min-h-20 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]'

const voiceStatus: Record<VoiceprintProfile['status'], string> = {
  unconfirmed: '待确认',
  confirmed: '已确认',
  disabled: '已停用',
}
const termStatus: Record<TerminologyItem['status'], string> = {
  candidate: '候选',
  confirmed: '已确认',
  disabled: '已停用',
}

type ProfileDraft = Pick<VoiceprintProfile, 'label' | 'role' | 'status' | 'sampleCount' | 'note'>
type TermDraft = Pick<TerminologyItem, 'term' | 'aliases' | 'status' | 'enabled' | 'note'>

const emptyProfile: ProfileDraft = { label: '', role: '', status: 'unconfirmed', sampleCount: 0, note: '' }
// 新建词默认纳入后续转写辅助流程；已有词的 enabled 状态保持用户当前选择。
const emptyTerm: TermDraft = { term: '', aliases: [], status: 'candidate', enabled: true, note: '' }

export default function ProfilesPage() {
  const profilesApi = useApi<{ profiles: VoiceprintProfile[] }>('/api/voiceprints')
  const termsApi = useApi<{ terms: TerminologyItem[] }>('/api/terminology')
  const profiles = profilesApi.data?.profiles ?? []
  const terms = termsApi.data?.terms ?? []
  const [profileEdit, setProfileEdit] = useState<string | 'new' | null>(null)
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfile)
  const [termEdit, setTermEdit] = useState<string | 'new' | null>(null)
  const [termDraft, setTermDraft] = useState<TermDraft>(emptyTerm)
  const [termQuery, setTermQuery] = useState('')
  const [error, setError] = useState('')
  const [duplicateProfile, setDuplicateProfile] = useState<{ sourceId: string; targetId: string } | null>(null)

  const activeProfiles = profiles.filter((x) => x.status !== 'confirmed')
  const archivedProfiles = profiles.filter((x) => x.status === 'confirmed')

  const visibleTerms = useMemo(() => {
    const q = termQuery.trim().toLowerCase()
    return terms.filter((x) => !q || `${x.term} ${x.aliases.join(' ')}`.toLowerCase().includes(q))
  }, [terms, termQuery])
  const activeTerms = visibleTerms.filter((x) => x.status !== 'confirmed')
  const archivedTerms = visibleTerms.filter((x) => x.status === 'confirmed')
  const audioTerms = activeTerms.filter((x) => x.clips.length > 0)
  const ungroundedTerms = activeTerms.filter((x) => x.clips.length === 0)
  const identityDuplicates = useMemo(() => {
    const groups = new Map<string, VoiceprintProfile[]>()
    for (const profile of profiles) {
      const key = identityValue(profile).toLowerCase()
      if (key) groups.set(key, [...(groups.get(key) || []), profile])
    }
    return [...groups.values()].filter((group) => group.length > 1)
  }, [profiles])

  const run = async (action: () => Promise<unknown>, reload: () => void) => {
    setError('')
    try {
      await action()
      reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const editProfile = (profile?: VoiceprintProfile) => {
    setDuplicateProfile(null)
    setProfileEdit(profile?.id || 'new')
    setProfileDraft(profile ? {
      label: profile.label,
      role: profile.role,
      status: profile.status,
      sampleCount: profile.sampleCount,
      note: profile.note,
    } : emptyProfile)
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = profileEdit
    if (!id) return
    if (id !== 'new') {
      const duplicate = profiles.find((x) => x.id !== id && x.label.trim().toLowerCase() === profileDraft.label.trim().toLowerCase())
      if (duplicate) {
        setDuplicateProfile({ sourceId: id, targetId: duplicate.id })
        setError(`已有同名声纹档案「${duplicate.label}」。如确认是同一人，请明确执行合并。`)
        return
      }
    }
    await run(
      () => apiWrite(id === 'new' ? 'POST' : 'PATCH', '/api/voiceprints', id === 'new' ? profileDraft : { id, ...profileDraft }),
      () => { profilesApi.reload(); setProfileEdit(null) },
    )
  }

  const mergeProfiles = async (pair: { sourceId: string; targetId: string }) => {
    await run(
      () => apiWrite('POST', '/api/voiceprints/merge', pair),
      () => { profilesApi.reload(); setProfileEdit(null); setDuplicateProfile(null) },
    )
  }

  const mergeDuplicate = async () => {
    if (duplicateProfile) await mergeProfiles(duplicateProfile)
  }

  const editTerm = (term?: TerminologyItem) => {
    setTermEdit(term?.id || 'new')
    setTermDraft(term ? {
      term: term.term,
      aliases: term.aliases,
      status: term.status,
      enabled: term.enabled,
      note: term.note,
    } : emptyTerm)
  }

  const saveTerm = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = termEdit
    if (!id) return
    await run(
      () => apiWrite(id === 'new' ? 'POST' : 'PATCH', '/api/terminology', id === 'new' ? termDraft : { id, ...termDraft }),
      () => { termsApi.reload(); setTermEdit(null) },
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] px-6 py-8">
      <div className="flex items-center gap-3">
        <Mic2 className="text-accent" size={28} />
        <h1 className="text-3xl font-bold">声纹与词库</h1>
      </div>
      <p className="mt-2 text-fg-muted">管理说话人档案和转写中容易出错的专业词。数据只保存在本机研究库。</p>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
        <ShieldCheck className="mt-0.5 shrink-0" size={17} />
        <div><b>隐私边界：</b>页面只读取档案元数据；声纹向量文件留在研究库，不通过浏览器接口返回。常见词目前作为整理和后续转写流程的词库，不会自动改写已有笔记。</div>
      </div>
      {error && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"><span>{error}</span>{duplicateProfile && <button type="button" onClick={mergeDuplicate} className="rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90">合并为同一人</button>}</div>}
      {identityDuplicates.length > 0 && <div className="mt-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <b>发现身份字段重名，请确认是否为同一人：</b>
        {identityDuplicates.map((group) => {
          const target = group[0]
          return <div key={group[0].role} className="flex flex-wrap items-center gap-2">
            <span>“{identityValue(target)}”：{group.map((x) => x.label).join('、')}</span>
            {group.slice(1).map((source) => <button key={source.id} type="button" onClick={() => {
              if (window.confirm(`确认将「${source.label}」合并到「${target.label}」？\n会保留两边的样本、声纹引用和试听片段。`)) void mergeProfiles({ sourceId: source.id, targetId: target.id })
            }} className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900">确认合并 {source.label} → {target.label}</button>)}
          </div>
        })}
      </div>}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="min-w-0">
          <SectionHeader icon={<Mic2 size={18} />} title="声纹档案" count={profiles.length} action={<button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-bg-muted" onClick={() => editProfile()}><Plus size={15} /> 新建</button>} />
          <p className="mb-3 text-xs text-fg-muted">本次实验先建立匿名档案；确认身份后再改名和角色。</p>
          {profileEdit && (
            <ProfileForm draft={profileDraft} setDraft={setProfileDraft} isNew={profileEdit === 'new'} onSubmit={saveProfile} onCancel={() => setProfileEdit(null)} />
          )}
          {profilesApi.loading && <div className="py-6 text-sm text-fg-muted">加载中…</div>}
          {profilesApi.error && <Empty>读取失败：{profilesApi.error}</Empty>}
          {!profilesApi.loading && !profilesApi.error && profiles.length === 0 && <Empty>还没有声纹档案。</Empty>}
          <div className="space-y-3">
            {activeProfiles.map((profile) => (
              <div key={profile.id} className="rounded-xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{profile.label}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <StatusPill tone={profile.status}>{voiceStatus[profile.status]}</StatusPill>
                      {profile.embeddingLabel && <span>编号：{profile.embeddingLabel}</span>}
                      {profile.role && <span>角色：{profile.role}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label="编辑档案" onClick={() => editProfile(profile)}><Edit3 size={15} /></IconButton>
                    <IconButton label="删除档案" onClick={() => {
                      if (window.confirm(`删除声纹档案「${profile.label}」？`)) run(() => apiWrite('DELETE', `/api/voiceprints?id=${encodeURIComponent(profile.id)}`), profilesApi.reload)
                    }}><Trash2 size={15} /></IconButton>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-fg-muted">
                  <div>样本 <b className="text-fg">{profile.sampleCount}</b></div>
                  <div>向量 <b className="text-fg">{profile.embeddingDimensions ? `${profile.embeddingDimensions} 维` : '未关联'}</b></div>
                </div>
                <ClipPlayers kind="voiceprint" ownerId={profile.id} clips={profile.clips} emptyText="暂无可试听片段" />
                {profile.embeddingFile && <div className="mt-2 truncate text-xs text-fg-muted" title={profile.embeddingFile}>附件：{profile.embeddingFile}</div>}
                {profile.note && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{profile.note}</p>}
              </div>
            ))}
          </div>
          {archivedProfiles.length > 0 && <details className="mt-4 rounded-xl border border-line bg-bg-muted px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">已确认归档（{archivedProfiles.length}）<span className="ml-1 text-xs font-normal text-fg-muted">展开后可修改</span></summary>
            <div className="mt-3 space-y-3">
              {archivedProfiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} onEdit={() => editProfile(profile)} onDelete={() => {
                  if (window.confirm(`删除声纹档案「${profile.label}」？`)) run(() => apiWrite('DELETE', `/api/voiceprints?id=${encodeURIComponent(profile.id)}`), profilesApi.reload)
                }} />
              ))}
            </div>
          </details>}
        </section>

        <section className="min-w-0">
          <SectionHeader icon={<BookText size={18} />} title="常见词 / 专业词" count={terms.length} action={<button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-bg-muted" onClick={() => editTerm()}><Plus size={15} /> 新建</button>} />
          <p className="mb-3 text-xs text-fg-muted">先记录候选词和别名。未确认词不会阻塞转写；确认后才会作为后续校对/提示资料使用。</p>
          {termEdit && <TermForm draft={termDraft} setDraft={setTermDraft} isNew={termEdit === 'new'} onSubmit={saveTerm} onCancel={() => setTermEdit(null)} />}
          <input value={termQuery} onChange={(e) => setTermQuery(e.target.value)} placeholder="搜索词或别名…" className={`${inputCls} mb-3`} />
          {termsApi.loading && <div className="py-6 text-sm text-fg-muted">加载中…</div>}
          {termsApi.error && <Empty>读取失败：{termsApi.error}</Empty>}
          {!termsApi.loading && !termsApi.error && visibleTerms.length === 0 && <Empty>{terms.length ? '没有匹配的词。' : '还没有常见词。'}</Empty>}
          <div className="space-y-2">
            {audioTerms.map((term) => (
              <div key={term.id} className="rounded-xl border border-line bg-card px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{term.term}</h2>
                      <StatusPill tone={term.status}>{termStatus[term.status]}</StatusPill>
                      {term.enabled && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check size={13} />已启用</span>}
                    </div>
                    {term.aliases.length > 0 && <div className="mt-1 text-xs text-fg-muted">别名：{term.aliases.join('、')}</div>}
                    <ClipPlayers kind="term" ownerId={term.id} clips={term.clips} emptyText="这条候选词在当前实验片段中没有找到对应原声" />
                    {term.note && <div className="mt-1 text-sm text-fg-muted">{term.note}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <IconButton label="编辑常见词" onClick={() => editTerm(term)}><Edit3 size={15} /></IconButton>
                    <IconButton label="删除常见词" onClick={() => {
                      if (window.confirm(`删除常见词「${term.term}」？`)) run(() => apiWrite('DELETE', `/api/terminology?id=${encodeURIComponent(term.id)}`), termsApi.reload)
                    }}><Trash2 size={15} /></IconButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {ungroundedTerms.length > 0 && <>
            <div className="mb-2 mt-5 text-xs font-medium text-fg-muted">词库候选 · 本次样本未命中（等待后续音频采样）</div>
            <div className="space-y-2">
              {ungroundedTerms.map((term) => (
                <TermCard key={term.id} term={term} emptyText="来源是候选词列表/工具实验，不是本次音频命中；需要后续音频采样后再确认" onEdit={() => editTerm(term)} onDelete={() => {
                  if (window.confirm(`删除常见词「${term.term}」？`)) run(() => apiWrite('DELETE', `/api/terminology?id=${encodeURIComponent(term.id)}`), termsApi.reload)
                }} />
              ))}
            </div>
          </>}
          {archivedTerms.length > 0 && <details className="mt-4 rounded-xl border border-line bg-bg-muted px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">已确认词汇归档（{archivedTerms.length}）<span className="ml-1 text-xs font-normal text-fg-muted">展开后可修改</span></summary>
            <div className="mt-3 space-y-2">
              {archivedTerms.map((term) => (
                <TermCard key={term.id} term={term} onEdit={() => editTerm(term)} onDelete={() => {
                  if (window.confirm(`删除常见词「${term.term}」？`)) run(() => apiWrite('DELETE', `/api/terminology?id=${encodeURIComponent(term.id)}`), termsApi.reload)
                }} />
              ))}
            </div>
          </details>}
        </section>
      </div>
    </div>
  )
}

function identityValue(profile: VoiceprintProfile): string {
  const label = profile.label.trim()
  // SPEAKER_xx 是技术编号；旧档案可能把姓名填在 role 中，兼容这个历史写法。
  return /^SPEAKER_\d+$/i.test(label) ? profile.role.trim() : label
}

function ClipPlayers({ kind, ownerId, clips, emptyText }: { kind: 'voiceprint' | 'term'; ownerId: string; clips: import('../lib/api').AudioClip[]; emptyText: string }) {
  if (clips.length === 0) return <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">{emptyText}</div>
  return (
    <div className="mt-3 space-y-2">
      {clips.map((clip) => (
        <div key={clip.id} className="rounded-lg bg-bg-muted px-2.5 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-fg-muted">
            <span>{clip.label || '试听片段'} · {clip.start.toFixed(1)}–{clip.end.toFixed(1)} 秒</span>
          </div>
          <audio controls preload="none" className="h-8 w-full" src={`/api/audio-clip?kind=${kind}&id=${encodeURIComponent(ownerId)}&clip=${encodeURIComponent(clip.id)}`} />
          {clip.text && <div className="mt-1 text-xs leading-relaxed text-fg-muted">“{clip.text}”</div>}
        </div>
      ))}
    </div>
  )
}

function ProfileCard({ profile, onEdit, onDelete }: { profile: VoiceprintProfile; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><h2 className="truncate font-semibold">{profile.label}</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted"><StatusPill tone={profile.status}>{voiceStatus[profile.status]}</StatusPill>{profile.embeddingLabel && <span>编号：{profile.embeddingLabel}</span>}{profile.role && <span>角色：{profile.role}</span>}</div></div>
        <div className="flex shrink-0 gap-1"><IconButton label="编辑档案" onClick={onEdit}><Edit3 size={15} /></IconButton><IconButton label="删除档案" onClick={onDelete}><Trash2 size={15} /></IconButton></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-fg-muted"><div>样本 <b className="text-fg">{profile.sampleCount}</b></div><div>向量 <b className="text-fg">{profile.embeddingDimensions ? `${profile.embeddingDimensions} 维` : '未关联'}</b></div></div>
      <ClipPlayers kind="voiceprint" ownerId={profile.id} clips={profile.clips} emptyText="暂无可试听片段" />
      {profile.embeddingFile && <div className="mt-2 truncate text-xs text-fg-muted" title={profile.embeddingFile}>附件：{profile.embeddingFile}</div>}
      {profile.note && <p className="mt-2 text-sm leading-relaxed text-fg-muted">{profile.note}</p>}
    </div>
  )
}

function TermCard({ term, emptyText = '这条候选词在当前实验片段中没有找到对应原声', onEdit, onDelete }: { term: TerminologyItem; emptyText?: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium">{term.term}</h2><StatusPill tone={term.status}>{termStatus[term.status]}</StatusPill>{term.enabled && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Check size={13} />已启用</span>}</div>{term.aliases.length > 0 && <div className="mt-1 text-xs text-fg-muted">别名：{term.aliases.join('、')}</div>}<ClipPlayers kind="term" ownerId={term.id} clips={term.clips} emptyText={emptyText} />{term.note && <div className="mt-1 text-sm text-fg-muted">{term.note}</div>}</div>
        <div className="flex shrink-0 gap-1"><IconButton label="编辑常见词" onClick={onEdit}><Edit3 size={15} /></IconButton><IconButton label="删除常见词" onClick={onDelete}><Trash2 size={15} /></IconButton></div>
      </div>
    </div>
  )
}

function SectionHeader({ icon, title, count, action }: { icon: React.ReactNode; title: string; count: number; action: React.ReactNode }) {
  return <div className="mb-1 flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-semibold">{icon}{title}<span className="text-sm font-normal text-fg-muted">{count}</span></div>{action}</div>
}

function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const cls = tone === 'confirmed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : tone === 'disabled' ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  return <span className={`rounded-md px-1.5 py-0.5 ${cls}`}>{children}</span>
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className="rounded-md p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg">{children}</button>
}

function ProfileForm({ draft, setDraft, isNew, onSubmit, onCancel }: { draft: ProfileDraft; setDraft: (x: ProfileDraft) => void; isNew: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="mb-3 rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
      <div className="mb-3 flex items-center justify-between"><b>{isNew ? '新建声纹档案' : '编辑声纹档案'}</b><button type="button" onClick={onCancel} className="text-fg-muted hover:text-fg"><X size={16} /></button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-fg-muted">说话人姓名 / 显示名称<input required value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={`${inputCls} mt-1 text-fg`} placeholder="例如：主持人" /><span className="mt-1 block text-[11px]">初始的 SPEAKER_00 只是技术编号，确认后建议改成真实姓名。</span></label>
        <label className="text-xs text-fg-muted">角色（可选）<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} className={`${inputCls} mt-1 text-fg`} placeholder="例如：主持人 / 产品经理" /></label>
        <label className="text-xs text-fg-muted">状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProfileDraft['status'] })} className={`${inputCls} mt-1 text-fg`}><option value="unconfirmed">待确认</option><option value="confirmed">已确认</option><option value="disabled">已停用</option></select></label>
        <label className="text-xs text-fg-muted">样本数<input type="number" min="0" value={draft.sampleCount} onChange={(e) => setDraft({ ...draft, sampleCount: Number(e.target.value) })} className={`${inputCls} mt-1 text-fg`} /></label>
      </div>
      <label className="mt-3 block text-xs text-fg-muted">备注<textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={`${textAreaCls} mt-1 text-fg`} placeholder="身份确认依据、录音来源等" /></label>
      <FormButtons onCancel={onCancel} />
    </form>
  )
}

function TermForm({ draft, setDraft, isNew, onSubmit, onCancel }: { draft: TermDraft; setDraft: (x: TermDraft) => void; isNew: boolean; onSubmit: (e: React.FormEvent) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="mb-3 rounded-xl border border-accent/40 bg-accent-soft/30 p-4">
      <div className="mb-3 flex items-center justify-between"><b>{isNew ? '新建常见词' : '编辑常见词'}</b><button type="button" onClick={onCancel} className="text-fg-muted hover:text-fg"><X size={16} /></button></div>
      <label className="block text-xs text-fg-muted">标准词<input required value={draft.term} onChange={(e) => setDraft({ ...draft, term: e.target.value })} className={`${inputCls} mt-1 text-fg`} placeholder="例如：faster-whisper" /></label>
      <label className="mt-3 block text-xs text-fg-muted">别名（用逗号分隔）<input value={draft.aliases.join(', ')} onChange={(e) => setDraft({ ...draft, aliases: e.target.value.split(/[,，]/).map((x) => x.trim()).filter(Boolean) })} className={`${inputCls} mt-1 text-fg`} placeholder="例如：fast whisper" /></label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-fg-muted">状态<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TermDraft['status'] })} className={`${inputCls} mt-1 text-fg`}><option value="candidate">候选</option><option value="confirmed">已确认</option><option value="disabled">已停用</option></select></label>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />启用到后续转写流程</label>
      </div>
      <label className="mt-3 block text-xs text-fg-muted">备注<textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={`${textAreaCls} mt-1 text-fg`} placeholder="来源、容易混淆的读法等" /></label>
      <FormButtons onCancel={onCancel} />
    </form>
  )
}

function FormButtons({ onCancel }: { onCancel: () => void }) {
  return <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-bg-muted">取消</button><button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-white hover:opacity-90"><Save size={14} />保存</button></div>
}

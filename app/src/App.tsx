import { NavLink, Route, Routes } from 'react-router-dom'
import { BookMarked, BookOpen, FolderKanban, ListTodo, Mic2 } from 'lucide-react'
import LibraryPage from './pages/LibraryPage'
import DetailPage from './pages/DetailPage'
import ProjectsPage from './pages/ProjectsPage'
import ProfilesPage from './pages/ProfilesPage'
import TasksPage from './pages/TasksPage'

const nav = [
  { to: '/', label: '研究库', icon: BookOpen, end: true },
  { to: '/tasks', label: '任务', icon: ListTodo, end: false },
  { to: '/projects', label: '项目画像', icon: FolderKanban, end: false },
  { to: '/profiles', label: '声纹与词库', icon: Mic2, end: false },
]

export default function App() {
  return (
    <div className="flex h-full">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-line bg-bg-muted md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-5">
          <BookMarked className="text-accent" size={22} />
          <span className="text-lg font-semibold">研究库</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <div className="px-2 pb-1 text-xs text-fg-muted">导航</div>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                  isActive ? 'bg-accent-soft font-medium text-accent' : 'hover:bg-bg'
                }`
              }
            >
              <Icon size={17} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line px-5 py-3 text-xs text-fg-muted">仅本机访问 · 数据不上传</div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {/* 窄屏顶部导航 */}
        <div className="flex gap-4 border-b border-line px-4 py-3 text-sm md:hidden">
          {nav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'font-semibold text-accent' : 'text-fg-muted')}>
              {label}
            </NavLink>
          ))}
        </div>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/note/:source/:name" element={<DetailPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
        </Routes>
      </main>
    </div>
  )
}

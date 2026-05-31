import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent, MouseEvent } from 'react'

import './App.css'
import type {
  Analytics,
  ActivityItem,
  BootstrapResponse,
  Notification,
  Project,
  ProjectTasksResponse,
  Task,
  TaskStatus,
  User,
} from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api'

const boardStatuses: Array<{ key: TaskStatus; label: string }> = [
  { key: 'TODO', label: 'Todo' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'DONE', label: 'Done' },
]

function formatDate(value?: string | null) {
  if (!value) {
    return 'No due date'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'No due date'
  }

  // Due dates are date-only semantics; format in UTC to avoid local timezone day shifts.
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return 'Just now'
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function toDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : ''
}

type EditFormState = {
  title: string
  description: string
  assigneeId: string
  dueDate: string
  status: TaskStatus
}

const emptyEditForm: EditFormState = {
  title: '',
  description: '',
  assigneeId: '',
  dueDate: '',
  status: 'TODO',
}

function toEditForm(task?: Task | null): EditFormState {
  if (!task) {
    return emptyEditForm
  }

  return {
    title: task.title,
    description: task.description ?? '',
    assigneeId: task.assigneeId ?? '',
    dueDate: toDateInputValue(task.dueDate),
    status: task.status,
  }
}

function resolveNextSelectedTask(
  tasks: Task[],
  currentTaskId: string,
): { taskId: string; form: EditFormState } {
  const nextTaskId = tasks.some((task) => task.id === currentTaskId)
    ? currentTaskId
    : (tasks[0]?.id ?? '')
  const nextTask = tasks.find((task) => task.id === nextTaskId) ?? null

  return {
    taskId: nextTaskId,
    form: toEditForm(nextTask),
  }
}

function nextStatus(status: TaskStatus, direction: 'forward' | 'backward') {
  const order: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']
  const index = order.indexOf(status)
  const nextIndex = direction === 'forward' ? index + 1 : index - 1
  return order[nextIndex]
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.message ?? 'Request failed')
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('taskflow-token') ?? '')
  const [viewer, setViewer] = useState<User | null>(null)
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null)
  const [workspace, setWorkspace] = useState<ProjectTasksResponse | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [teamForm, setTeamForm] = useState({ name: '', description: '' })
  const [projectForm, setProjectForm] = useState({ name: '', description: '' })
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    assigneeId: '',
    dueDate: '',
  })
  const [editForm, setEditForm] = useState<EditFormState>(emptyEditForm)
  const [commentBody, setCommentBody] = useState('')
  const [filters, setFilters] = useState({
    q: '',
    status: 'ALL',
    assigneeId: 'ALL',
    dueBefore: '',
  })
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [draggedTaskId, setDraggedTaskId] = useState('')

  const deferredSearch = useDeferredValue(filters.q)
  const teams = bootstrap?.teams ?? []
  const resolvedSelectedTeamId =
    teams.some((team) => team.id === selectedTeamId) ? selectedTeamId : (teams[0]?.id ?? '')
  const selectedTeam = teams.find((team) => team.id === resolvedSelectedTeamId) ?? null
  const teamProjects = selectedTeam?.projects ?? []
  const resolvedSelectedProjectId =
    teamProjects.some((project) => project.id === selectedProjectId)
      ? selectedProjectId
      : (teamProjects[0]?.id ?? '')
  const selectedProject =
    teamProjects.find((project) => project.id === resolvedSelectedProjectId) ?? null
  const members = workspace?.teamMembers ?? selectedTeam?.members ?? []
  const selectedTask = workspace?.tasks.find((task) => task.id === selectedTaskId) ?? null

  function resetSessionState() {
    startTransition(() => {
      setViewer(null)
      setBootstrap(null)
      setWorkspace(null)
      setActivity([])
      setAnalytics(null)
      setSelectedTeamId('')
      setSelectedProjectId('')
      setSelectedTaskId('')
      setEditForm(emptyEditForm)
    })
  }

  async function loadBootstrap(currentToken = token) {
    if (!currentToken) {
      return
    }

    const data = await request<BootstrapResponse>('/bootstrap', currentToken)
    startTransition(() => {
      setViewer(data.user)
      setBootstrap(data)
    })
  }

  async function loadActivity(currentToken = token) {
    if (!currentToken) {
      return
    }

    const data = await request<{ activity: ActivityItem[] }>('/activity', currentToken)
    startTransition(() => setActivity(data.activity))
  }

  async function loadWorkspace(projectId: string, currentToken = token) {
    if (!currentToken || !projectId) {
      return
    }

    setLoading(true)
    const query = new URLSearchParams()

    if (filters.status !== 'ALL') {
      query.set('status', filters.status)
    }
    if (filters.assigneeId !== 'ALL') {
      query.set('assigneeId', filters.assigneeId)
    }
    if (filters.dueBefore) {
      query.set('dueBefore', filters.dueBefore)
    }
    if (deferredSearch.trim()) {
      query.set('q', deferredSearch.trim())
    }

    try {
      const [taskData, analyticsData] = await Promise.all([
        request<ProjectTasksResponse>(
          `/projects/${projectId}/tasks${query.size ? `?${query.toString()}` : ''}`,
          currentToken,
        ),
        request<{ analytics: Analytics }>(`/projects/${projectId}/analytics`, currentToken),
      ])

      startTransition(() => {
        let nextSelection = { taskId: '', form: emptyEditForm }

        setWorkspace(taskData)
        setAnalytics(analyticsData.analytics)
        setSelectedTaskId((currentTaskId) => {
          nextSelection = resolveNextSelectedTask(taskData.tasks, currentTaskId)
          return nextSelection.taskId
        })
        setEditForm(nextSelection.form)
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!token) {
      return
    }

    void (async () => {
      try {
        const [bootstrapData, activityData] = await Promise.all([
          request<BootstrapResponse>('/bootstrap', token),
          request<{ activity: ActivityItem[] }>('/activity', token),
        ])

        startTransition(() => {
          setViewer(bootstrapData.user)
          setBootstrap(bootstrapData)
          setActivity(activityData.activity)
        })
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load workspace')
        localStorage.removeItem('taskflow-token')
        setToken('')
        resetSessionState()
      }
    })()
  }, [token])

  useEffect(() => {
    if (!resolvedSelectedProjectId || !token) {
      return
    }

    void (async () => {
      setLoading(true)

      const query = new URLSearchParams()

      if (filters.status !== 'ALL') {
        query.set('status', filters.status)
      }
      if (filters.assigneeId !== 'ALL') {
        query.set('assigneeId', filters.assigneeId)
      }
      if (filters.dueBefore) {
        query.set('dueBefore', filters.dueBefore)
      }
      if (deferredSearch.trim()) {
        query.set('q', deferredSearch.trim())
      }

      try {
        const [taskData, analyticsData] = await Promise.all([
          request<ProjectTasksResponse>(
            `/projects/${resolvedSelectedProjectId}/tasks${query.size ? `?${query.toString()}` : ''}`,
            token,
          ),
          request<{ analytics: Analytics }>(`/projects/${resolvedSelectedProjectId}/analytics`, token),
        ])

        startTransition(() => {
          let nextSelection = { taskId: '', form: emptyEditForm }

          setWorkspace(taskData)
          setAnalytics(analyticsData.analytics)
          setSelectedTaskId((currentTaskId) => {
            nextSelection = resolveNextSelectedTask(taskData.tasks, currentTaskId)
            return nextSelection.taskId
          })
          setEditForm(nextSelection.form)
        })
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load tasks')
      } finally {
        setLoading(false)
      }
    })()
  }, [resolvedSelectedProjectId, filters.status, filters.assigneeId, filters.dueBefore, deferredSearch, token])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)
    setError('')

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register'
      const payload = authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : authForm

      const data = await request<{ token: string; user: User }>(endpoint, '', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      localStorage.setItem('taskflow-token', data.token)
      setToken(data.token)
      setViewer(data.user)
      setAuthForm({ name: '', email: '', password: '' })
      setInfo('Signed in to TaskFlow.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to sign in')
    } finally {
      setWorking(false)
    }
  }

  async function refreshAll(projectId = resolvedSelectedProjectId) {
    await Promise.all([
      loadBootstrap(),
      loadActivity(),
      projectId ? loadWorkspace(projectId) : Promise.resolve(),
    ])
  }

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)
    setError('')

    try {
      await request('/teams', token, {
        method: 'POST',
        body: JSON.stringify(teamForm),
      })
      setTeamForm({ name: '', description: '' })
      await loadBootstrap()
      await loadActivity()
      setInfo('Team created.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create team')
    } finally {
      setWorking(false)
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedTeam) {
      setError('Create or select a team first.')
      return
    }

    setWorking(true)
    setError('')

    try {
      const response = await request<{ project: Project }>('/projects', token, {
        method: 'POST',
        body: JSON.stringify({
          ...projectForm,
          teamId: selectedTeam.id,
        }),
      })
      setProjectForm({ name: '', description: '' })
      await loadBootstrap()
      setSelectedProjectId(response.project.id)
      await loadActivity()
      setInfo('Project created.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create project')
    } finally {
      setWorking(false)
    }
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedProject) {
      setError('Select a project first.')
      return
    }

    setWorking(true)
    setError('')

    try {
      await request('/tasks', token, {
        method: 'POST',
        body: JSON.stringify({
          projectId: selectedProject.id,
          title: taskForm.title,
          description: taskForm.description,
          assigneeId: taskForm.assigneeId || null,
          dueDate: taskForm.dueDate || null,
        }),
      })
      setTaskForm({ title: '', description: '', assigneeId: '', dueDate: '' })
      await refreshAll(selectedProject.id)
      setInfo('Task created.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to create task')
    } finally {
      setWorking(false)
    }
  }

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedTask) {
      return
    }

    setWorking(true)
    setError('')

    try {
      await request(`/tasks/${selectedTask.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title,
          description: editForm.description,
          assigneeId: editForm.assigneeId || null,
          dueDate: editForm.dueDate || null,
          status: editForm.status,
        }),
      })
      await refreshAll(resolvedSelectedProjectId)
      setInfo('Task updated.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to update task')
    } finally {
      setWorking(false)
    }
  }

  async function handleDeleteTask() {
    if (!selectedTask) {
      return
    }

    setWorking(true)
    setError('')

    try {
      await request(`/tasks/${selectedTask.id}`, token, {
        method: 'DELETE',
      })
      await refreshAll(resolvedSelectedProjectId)
      setInfo('Task deleted.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to delete task')
    } finally {
      setWorking(false)
    }
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedTask || !commentBody.trim()) {
      return
    }

    setWorking(true)

    try {
      await request(`/tasks/${selectedTask.id}/comments`, token, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody.trim() }),
      })
      setCommentBody('')
      await refreshAll(resolvedSelectedProjectId)
      setInfo('Comment added.')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to add comment')
    } finally {
      setWorking(false)
    }
  }

  async function handleMoveTask(task: Task, status: TaskStatus) {
    const previousTasks = workspace?.tasks ?? []

    startTransition(() => {
      setWorkspace((current) =>
        current
          ? {
              ...current,
              tasks: current.tasks.map((entry) =>
                entry.id === task.id ? { ...entry, status } : entry,
              ),
            }
          : current,
      )
    })

    try {
      await request(`/tasks/${task.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await refreshAll(resolvedSelectedProjectId)
    } catch (submitError) {
      startTransition(() => {
        setWorkspace((current) => (current ? { ...current, tasks: previousTasks } : current))
      })
      setError(submitError instanceof Error ? submitError.message : 'Unable to move task')
    }
  }

  function handleTaskDragStart(event: DragEvent<HTMLElement>, taskId: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', taskId)
    setDraggedTaskId(taskId)
  }

  function handleTaskDragEnd() {
    setDraggedTaskId('')
  }

  function handleTaskDrop(event: DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault()

    const taskId = event.dataTransfer.getData('text/plain') || draggedTaskId
    const task = workspace?.tasks.find((entry) => entry.id === taskId)

    if (!task || task.status === status) {
      setDraggedTaskId('')
      return
    }

    setDraggedTaskId('')
    void handleMoveTask(task, status)
  }

  function handleSelectTask(task: Task) {
    setSelectedTaskId(task.id)
    setEditForm(toEditForm(task))
  }

  function signOut() {
    localStorage.removeItem('taskflow-token')
    setToken('')
    resetSessionState()
    setInfo('Signed out.')
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <section className="auth-hero panel">
          <p className="eyebrow">Internal workflow system</p>
          <h1>TaskFlow keeps teams, projects, tasks, and delivery history in one place.</h1>
          <p className="lede">
            Sign in to create project workspaces, assign owners, update delivery status, and
            review activity across your team.
          </p>
          <div className="hero-grid">
            <article>
              <span>01</span>
              <strong>PostgreSQL-backed workflow</strong>
              <p>Teams, projects, tasks, comments, notifications, and activity are modeled relationally.</p>
            </article>
            <article>
              <span>02</span>
              <strong>Operator-grade visibility</strong>
              <p>Filters, analytics, and an activity feed make the app feel like an internal ops product.</p>
            </article>
            <article>
              <span>03</span>
              <strong>Seeded demo accounts</strong>
              <p>Use alex@taskflow.local, maya@taskflow.local, or jordan@taskflow.local with password123.</p>
            </article>
          </div>
        </section>

        <section className="auth-card panel">
          <div className="auth-tabs">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => setAuthMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => setAuthMode('register')}
            >
              Create account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'register' ? (
              <label>
                <span>Name</span>
                <input
                  value={authForm.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = event.currentTarget.value
                    setAuthForm((current) => ({ ...current, name: value }))
                  }}
                  placeholder="Avery Morgan"
                  required
                />
              </label>
            ) : null}

            <label>
              <span>Email</span>
              <input
                type="email"
                value={authForm.email}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setAuthForm((current) => ({ ...current, email: value }))
                }}
                placeholder="name@company.com"
                required
              />
            </label>

            <label>
              <span>Password</span>
              <input
                type="password"
                value={authForm.password}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setAuthForm((current) => ({ ...current, password: value }))
                }}
                placeholder="Minimum 8 characters"
                required
              />
            </label>

            <button type="submit" className="primary-button" disabled={working}>
              {working ? 'Working...' : authMode === 'login' ? 'Sign in to TaskFlow' : 'Create account'}
            </button>
          </form>

          {error ? <p className="feedback error">{error}</p> : null}
          {info ? <p className="feedback success">{info}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar panel">
        <div>
          <p className="eyebrow">TaskFlow</p>
          <h1>Team workflow command center</h1>
        </div>
        <div className="topbar-actions">
          <div>
            <strong>{viewer?.name}</strong>
            <p>{viewer?.email}</p>
          </div>
          <button type="button" className="secondary-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {error ? <p className="feedback error wide">{error}</p> : null}
      {info ? <p className="feedback success wide">{info}</p> : null}

      <section className="overview-grid">
        <article className="panel metric-card">
          <span>Total tasks</span>
          <strong>{analytics?.total ?? 0}</strong>
        </article>
        <article className="panel metric-card">
          <span>Completed</span>
          <strong>{analytics?.done ?? 0}</strong>
        </article>
        <article className="panel metric-card">
          <span>Overdue</span>
          <strong>{analytics?.overdue ?? 0}</strong>
        </article>
        <article className="panel metric-card accent-card">
          <span>Completion rate</span>
          <strong>{analytics?.completionRate ?? 0}%</strong>
        </article>
      </section>

      <section className="content-grid">
        <aside className="left-rail">
          <section className="panel stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Teams</p>
                <h2>Workspaces</h2>
              </div>
            </div>

            <div className="chip-list">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={team.id === resolvedSelectedTeamId ? 'chip active' : 'chip'}
                  onClick={() => setSelectedTeamId(team.id)}
                >
                  {team.name}
                </button>
              ))}
            </div>

            <form className="stack compact-form" onSubmit={handleCreateTeam}>
              <label>
                <span>New team</span>
                <input
                  value={teamForm.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = event.currentTarget.value
                    setTeamForm((current) => ({ ...current, name: value }))
                  }}
                  placeholder="Platform Operations"
                  required
                />
              </label>
              <textarea
                value={teamForm.description}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  const value = event.currentTarget.value
                  setTeamForm((current) => ({ ...current, description: value }))
                }}
                placeholder="What this team owns"
                rows={3}
              />
              <button type="submit" className="secondary-button" disabled={working}>
                Add team
              </button>
            </form>
          </section>

          <section className="panel stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Projects</p>
                <h2>{selectedTeam?.name ?? 'Select a team'}</h2>
              </div>
            </div>

            <div className="project-list">
              {(selectedTeam?.projects ?? []).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={project.id === resolvedSelectedProjectId ? 'project-item active' : 'project-item'}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <strong>{project.name}</strong>
                  <span>{project.description || 'No description yet'}</span>
                </button>
              ))}
            </div>

            <form className="stack compact-form" onSubmit={handleCreateProject}>
              <label>
                <span>New project</span>
                <input
                  value={projectForm.name}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    const value = event.currentTarget.value
                    setProjectForm((current) => ({ ...current, name: value }))
                  }}
                  placeholder="Enterprise Onboarding"
                  required
                />
              </label>
              <textarea
                value={projectForm.description}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  const value = event.currentTarget.value
                  setProjectForm((current) => ({ ...current, description: value }))
                }}
                placeholder="Delivery objective"
                rows={3}
              />
              <button type="submit" className="secondary-button" disabled={working || !selectedTeam}>
                Add project
              </button>
            </form>
          </section>

          <section className="panel stack notifications-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Notifications</p>
                <h2>Assignments</h2>
              </div>
            </div>

            {(bootstrap?.notifications ?? []).length ? (
              (bootstrap?.notifications ?? []).map((notification: Notification) => (
                <article key={notification.id} className="notification-item">
                  <strong>{notification.message}</strong>
                  <span>{formatDateTime(notification.createdAt)}</span>
                </article>
              ))
            ) : (
              <p className="muted">No unread notifications.</p>
            )}
          </section>
        </aside>

        <section className="main-column">
          <section className="panel stack">
            <div className="section-head split">
              <div>
                <p className="eyebrow">Board</p>
                <h2>{selectedProject?.name ?? 'Create a project'}</h2>
              </div>
              <div className="board-meta">
                <span>{loading ? 'Refreshing...' : `${workspace?.tasks.length ?? 0} visible tasks`}</span>
              </div>
            </div>

            <form className="filters-bar" onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}>
              <input
                aria-label="Search tasks"
                title="Search tasks"
                value={filters.q}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setFilters((current) => ({ ...current, q: value }))
                }}
                placeholder="Search title or description"
              />
              <select
                aria-label="Filter by status"
                title="Filter by status"
                value={filters.status}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const value = event.currentTarget.value
                  setFilters((current) => ({ ...current, status: value }))
                }}
              >
                <option value="ALL">All statuses</option>
                <option value="TODO">Todo</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Done</option>
              </select>
              <select
                aria-label="Filter by assignee"
                title="Filter by assignee"
                value={filters.assigneeId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const value = event.currentTarget.value
                  setFilters((current) => ({ ...current, assigneeId: value }))
                }}
              >
                <option value="ALL">All assignees</option>
                {members.map((member) => (
                  <option key={member.id} value={member.userId}>
                    {member.user.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Filter by due date"
                title="Filter by due date"
                value={filters.dueBefore}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setFilters((current) => ({ ...current, dueBefore: value }))
                }}
              />
            </form>

            <form className="create-task-form" onSubmit={handleCreateTask}>
              <input
                aria-label="Task title"
                title="Task title"
                value={taskForm.title}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setTaskForm((current) => ({ ...current, title: value }))
                }}
                placeholder="Add a task title"
                required
              />
              <input
                aria-label="Task description"
                title="Task description"
                value={taskForm.description}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setTaskForm((current) => ({ ...current, description: value }))
                }}
                placeholder="Short task description"
              />
              <select
                aria-label="Assign task owner"
                title="Assign task owner"
                value={taskForm.assigneeId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  const value = event.currentTarget.value
                  setTaskForm((current) => ({ ...current, assigneeId: value }))
                }}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.userId}>
                    {member.user.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                aria-label="Task due date"
                title="Task due date"
                value={taskForm.dueDate}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const value = event.currentTarget.value
                  setTaskForm((current) => ({ ...current, dueDate: value }))
                }}
              />
              <button type="submit" className="primary-button" disabled={working || !selectedProject}>
                Add task
              </button>
            </form>

            <div className="board-grid">
              {boardStatuses.map((column) => (
                <section
                  key={column.key}
                  className="board-column"
                  onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()}
                  onDrop={(event: DragEvent<HTMLElement>) => handleTaskDrop(event, column.key)}
                >
                  <header>
                    <strong>{column.label}</strong>
                    <span>
                      {workspace?.tasks.filter((task) => task.status === column.key).length ?? 0}
                    </span>
                  </header>
                  <div className="column-stack">
                    {workspace?.tasks
                      .filter((task) => task.status === column.key)
                      .map((task) => (
                        <article
                          key={task.id}
                          className={
                            task.id === selectedTaskId
                              ? draggedTaskId === task.id
                                ? 'task-card active dragging'
                                : 'task-card active'
                              : draggedTaskId === task.id
                                ? 'task-card dragging'
                                : 'task-card'
                          }
                          draggable
                          onClick={() => handleSelectTask(task)}
                          onDragStart={(event: DragEvent<HTMLElement>) => handleTaskDragStart(event, task.id)}
                          onDragEnd={handleTaskDragEnd}
                        >
                          <div className="task-card-head">
                            <strong>{task.title}</strong>
                            <span>{task.assignee?.name ?? 'Unassigned'}</span>
                          </div>
                          <p>{task.description || 'No description provided.'}</p>
                          <div className="task-card-foot">
                            <small>Due {formatDate(task.dueDate)}</small>
                            <div className="move-buttons">
                              {nextStatus(task.status, 'backward') ? (
                                <button
                                  type="button"
                                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                    event.stopPropagation()
                                    void handleMoveTask(task, nextStatus(task.status, 'backward')!)
                                  }}
                                >
                                  Back
                                </button>
                              ) : null}
                              {nextStatus(task.status, 'forward') ? (
                                <button
                                  type="button"
                                  onClick={(event: MouseEvent<HTMLButtonElement>) => {
                                    event.stopPropagation()
                                    void handleMoveTask(task, nextStatus(task.status, 'forward')!)
                                  }}
                                >
                                  Move
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </section>

        <aside className="right-rail">
          <section className="panel stack">
            <div className="section-head">
              <div>
                <p className="eyebrow">Task detail</p>
                <h2>{selectedTask?.title ?? 'Select a task'}</h2>
              </div>
            </div>

            {selectedTask ? (
              <>
                <form className="stack compact-form" onSubmit={handleUpdateTask}>
                  <label>
                    <span>Title</span>
                    <input
                      value={editForm.title}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const value = event.currentTarget.value
                        setEditForm((current) => ({ ...current, title: value }))
                      }}
                      required
                    />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea
                      value={editForm.description}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                        const value = event.currentTarget.value
                        setEditForm((current) => ({ ...current, description: value }))
                      }}
                      rows={4}
                    />
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={editForm.status}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        const value = event.currentTarget.value as TaskStatus
                        setEditForm((current) => ({ ...current, status: value }))
                      }}
                    >
                      <option value="TODO">Todo</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="DONE">Done</option>
                    </select>
                  </label>
                  <label>
                    <span>Assignee</span>
                    <select
                      value={editForm.assigneeId}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        const value = event.currentTarget.value
                        setEditForm((current) => ({ ...current, assigneeId: value }))
                      }}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.userId}>
                          {member.user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Due date</span>
                    <input
                      type="date"
                      value={editForm.dueDate}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => {
                        const value = event.currentTarget.value
                        setEditForm((current) => ({ ...current, dueDate: value }))
                      }}
                    />
                  </label>
                  <div className="action-row">
                    <button type="submit" className="primary-button" disabled={working}>
                      Save changes
                    </button>
                    <button type="button" className="danger-button" onClick={handleDeleteTask} disabled={working}>
                      Delete
                    </button>
                  </div>
                </form>

                <div className="detail-meta">
                  <span>Created by {selectedTask.creator.name}</span>
                  <span>Updated {formatDateTime(selectedTask.updatedAt)}</span>
                </div>

                <div className="comment-stack">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">Comments</p>
                      <h3>Discussion</h3>
                    </div>
                  </div>

                  {selectedTask.comments.length ? (
                    selectedTask.comments.map((comment) => (
                      <article key={comment.id} className="comment-item">
                        <div>
                          <strong>{comment.author.name}</strong>
                          <span>{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p>{comment.body}</p>
                      </article>
                    ))
                  ) : (
                    <p className="muted">No comments yet.</p>
                  )}

                  <form className="stack compact-form" onSubmit={handleCommentSubmit}>
                    <textarea
                      value={commentBody}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                        const value = event.currentTarget.value
                        setCommentBody(value)
                      }}
                      placeholder="Add context, blockers, or delivery notes"
                      rows={3}
                    />
                    <button type="submit" className="secondary-button" disabled={working || !commentBody.trim()}>
                      Add comment
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <p className="muted">Pick a task from the board to edit details and review discussion.</p>
            )}
          </section>

          <section className="panel stack activity-panel">
            <div className="section-head">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Recent changes</h2>
              </div>
            </div>

            {activity.length ? (
              activity.map((item) => (
                <article key={item.id} className="activity-item">
                  <strong>{item.actor?.name ?? 'System'} {item.message}</strong>
                  <span>{item.project?.name ?? 'No project'} · {formatDateTime(item.createdAt)}</span>
                </article>
              ))
            ) : (
              <p className="muted">No activity yet.</p>
            )}
          </section>
        </aside>
      </section>
    </main>
  )
}

export default App

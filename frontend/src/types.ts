export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export type User = {
  id: string
  name: string
  email: string
}

export type Notification = {
  id: string
  taskId: string | null
  message: string
  readAt: string | null
  createdAt: string
}

export type TeamMember = {
  id: string
  role: 'ADMIN' | 'MEMBER'
  userId: string
  user: User
}

export type Project = {
  id: string
  teamId: string
  name: string
  description?: string | null
  createdAt: string
  updatedAt: string
}

export type Team = {
  id: string
  name: string
  slug: string
  description?: string | null
  members: TeamMember[]
  projects: Project[]
}

export type TaskComment = {
  id: string
  body: string
  createdAt: string
  author: User
}

export type ActivityItem = {
  id: string
  type: string
  message: string
  createdAt: string
  actor?: User | null
  project?: {
    id: string
    name: string
  }
  task?: {
    id: string
    title: string
    status: TaskStatus
  } | null
}

export type Task = {
  id: string
  projectId: string
  title: string
  description?: string | null
  status: TaskStatus
  dueDate?: string | null
  completedAt?: string | null
  createdAt: string
  updatedAt: string
  assigneeId?: string | null
  assignee?: User | null
  creator: User
  comments: TaskComment[]
  activities: ActivityItem[]
}

export type Analytics = {
  total: number
  done: number
  overdue: number
  completionRate: number
}

export type BootstrapResponse = {
  user: User
  teams: Team[]
  notifications: Notification[]
}

export type ProjectTasksResponse = {
  project: Project & {
    team: Team
    createdBy: User
  }
  tasks: Task[]
  teamMembers: TeamMember[]
}
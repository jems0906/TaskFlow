import { ActivityType, TaskStatus } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'

import { createAssignmentNotification, recordActivity } from '../lib/activity.js'
import { getProjectForUser, getTaskForUser } from '../lib/access.js'
import { prisma, publicUserSelect } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const createTaskSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().min(2).max(140),
  description: z.string().max(1200).optional(),
  assigneeId: z.string().cuid().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.nativeEnum(TaskStatus).optional(),
})

const updateTaskSchema = createTaskSchema
  .omit({ projectId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')

const commentSchema = z.object({
  body: z.string().min(1).max(600),
})

function parseDueDate(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  if (value === null || value === '') {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid due date')
  }

  return date
}

function hasMember(project: Awaited<ReturnType<typeof getProjectForUser>>, assigneeId: string) {
  return project?.team.members.some((member) => member.userId === assigneeId)
}

function canManageTask(task: Awaited<ReturnType<typeof getTaskForUser>>, userId: string) {
  const membership = task?.project.team.members.find((member) => member.userId === userId)

  return (
    membership?.role === 'ADMIN' ||
    task?.creatorId === userId ||
    task?.assigneeId === userId
  )
}

export const tasksRouter = Router()

tasksRouter.use(requireAuth)

tasksRouter.post('/', async (request, response, next) => {
  try {
    const payload = createTaskSchema.parse(request.body)
    const project = await getProjectForUser(request.user!.id, payload.projectId)

    if (!project) {
      response.status(404).json({ message: 'Project not found' })
      return
    }

    if (payload.assigneeId && !hasMember(project, payload.assigneeId)) {
      response.status(400).json({ message: 'Assignee must belong to the project team' })
      return
    }

    const task = await prisma.task.create({
      data: {
        projectId: project.id,
        title: payload.title,
        description: payload.description,
        assigneeId: payload.assigneeId ?? null,
        dueDate: parseDueDate(payload.dueDate),
        status: payload.status ?? TaskStatus.TODO,
        creatorId: request.user!.id,
      },
      include: {
        assignee: {
          select: publicUserSelect,
        },
        creator: {
          select: publicUserSelect,
        },
        comments: {
          include: {
            author: {
              select: publicUserSelect,
            },
          },
        },
        activities: {
          include: {
            actor: {
              select: publicUserSelect,
            },
          },
        },
      },
    })

    await recordActivity({
      actorId: request.user!.id,
      projectId: project.id,
      taskId: task.id,
      type: ActivityType.TASK_CREATED,
      message: `created task ${task.title}`,
    })

    if (task.assigneeId && task.assigneeId !== request.user!.id) {
      await createAssignmentNotification(task.assigneeId, task.id, `You were assigned to ${task.title}`)
      await recordActivity({
        actorId: request.user!.id,
        projectId: project.id,
        taskId: task.id,
        type: ActivityType.TASK_ASSIGNED,
        message: `assigned ${task.title}`,
      })
    }

    response.status(201).json({ task })
  } catch (error) {
    next(error)
  }
})

tasksRouter.patch('/:id', async (request, response, next) => {
  try {
    const payload = updateTaskSchema.parse(request.body)
    const existingTask = await getTaskForUser(request.user!.id, request.params.id)

    if (!existingTask) {
      response.status(404).json({ message: 'Task not found' })
      return
    }

    if (!canManageTask(existingTask, request.user!.id)) {
      response.status(403).json({ message: 'You do not have permission to edit this task' })
      return
    }

    if (payload.assigneeId && !existingTask.project.team.members.some((member) => member.userId === payload.assigneeId)) {
      response.status(400).json({ message: 'Assignee must belong to the project team' })
      return
    }

    const updatedTask = await prisma.task.update({
      where: { id: existingTask.id },
      data: {
        title: payload.title,
        description: payload.description,
        status: payload.status,
        assigneeId: payload.assigneeId === undefined ? undefined : payload.assigneeId,
        dueDate: parseDueDate(payload.dueDate),
        completedAt:
          payload.status === undefined
            ? undefined
            : payload.status === TaskStatus.DONE
              ? new Date()
              : null,
      },
      include: {
        assignee: {
          select: publicUserSelect,
        },
        creator: {
          select: publicUserSelect,
        },
        comments: {
          include: {
            author: {
              select: publicUserSelect,
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          include: {
            actor: {
              select: publicUserSelect,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    const activityMessages: Array<{ type: ActivityType; message: string }> = []

    if (payload.status && payload.status !== existingTask.status) {
      activityMessages.push({
        type: ActivityType.TASK_STATUS_CHANGED,
        message: `moved ${updatedTask.title} to ${payload.status.replace('_', ' ')}`,
      })
    }

    if (payload.assigneeId !== undefined && payload.assigneeId !== existingTask.assigneeId) {
      activityMessages.push({
        type: ActivityType.TASK_ASSIGNED,
        message: payload.assigneeId ? `reassigned ${updatedTask.title}` : `cleared assignee on ${updatedTask.title}`,
      })

      if (payload.assigneeId && payload.assigneeId !== request.user!.id) {
        await createAssignmentNotification(payload.assigneeId, updatedTask.id, `You were assigned to ${updatedTask.title}`)
      }
    }

    if (payload.title || payload.description || payload.dueDate !== undefined) {
      activityMessages.push({
        type: ActivityType.TASK_UPDATED,
        message: `updated ${updatedTask.title}`,
      })
    }

    for (const entry of activityMessages) {
      await recordActivity({
        actorId: request.user!.id,
        projectId: existingTask.projectId,
        taskId: updatedTask.id,
        type: entry.type,
        message: entry.message,
      })
    }

    response.json({ task: updatedTask })
  } catch (error) {
    next(error)
  }
})

tasksRouter.delete('/:id', async (request, response, next) => {
  try {
    const task = await getTaskForUser(request.user!.id, request.params.id)

    if (!task) {
      response.status(404).json({ message: 'Task not found' })
      return
    }

    if (!canManageTask(task, request.user!.id)) {
      response.status(403).json({ message: 'You do not have permission to delete this task' })
      return
    }

    await recordActivity({
      actorId: request.user!.id,
      projectId: task.projectId,
      type: ActivityType.TASK_DELETED,
      message: `deleted task ${task.title}`,
      metadata: { taskTitle: task.title },
    })

    await prisma.task.delete({ where: { id: task.id } })

    response.status(204).send()
  } catch (error) {
    next(error)
  }
})

tasksRouter.post('/:id/comments', async (request, response, next) => {
  try {
    const payload = commentSchema.parse(request.body)
    const task = await getTaskForUser(request.user!.id, request.params.id)

    if (!task) {
      response.status(404).json({ message: 'Task not found' })
      return
    }

    const comment = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        authorId: request.user!.id,
        body: payload.body,
      },
      include: {
        author: {
          select: publicUserSelect,
        },
      },
    })

    await recordActivity({
      actorId: request.user!.id,
      projectId: task.projectId,
      taskId: task.id,
      type: ActivityType.TASK_COMMENTED,
      message: `commented on ${task.title}`,
    })

    response.status(201).json({ comment })
  } catch (error) {
    next(error)
  }
})
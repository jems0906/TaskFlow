import { ActivityType, TaskStatus } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'

import { recordActivity } from '../lib/activity.js'
import { getProjectForUser, getTeamForUser } from '../lib/access.js'
import { prisma, publicUserSelect } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const projectSchema = z.object({
  teamId: z.string().cuid(),
  name: z.string().min(2).max(100),
  description: z.string().max(300).optional(),
})

export const projectsRouter = Router()

projectsRouter.use(requireAuth)

projectsRouter.post('/', async (request, response, next) => {
  try {
    const payload = projectSchema.parse(request.body)
    const team = await getTeamForUser(request.user!.id, payload.teamId)

    if (!team) {
      response.status(404).json({ message: 'Team not found' })
      return
    }

    const project = await prisma.project.create({
      data: {
        teamId: payload.teamId,
        name: payload.name,
        description: payload.description,
        createdById: request.user!.id,
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: publicUserSelect,
        },
      },
    })

    await recordActivity({
      actorId: request.user!.id,
      projectId: project.id,
      type: ActivityType.PROJECT_CREATED,
      message: `created project ${project.name}`,
    })

    response.status(201).json({ project })
  } catch (error) {
    next(error)
  }
})

projectsRouter.get('/:id/tasks', async (request, response, next) => {
  try {
    const project = await getProjectForUser(request.user!.id, request.params.id)

    if (!project) {
      response.status(404).json({ message: 'Project not found' })
      return
    }

    const status = request.query.status
    const assigneeId = request.query.assigneeId
    const dueBefore = request.query.dueBefore
    const search = request.query.q

    const filters: Record<string, unknown> = { projectId: project.id }

    if (typeof status === 'string' && Object.values(TaskStatus).includes(status as TaskStatus)) {
      filters.status = status
    }

    if (typeof assigneeId === 'string' && assigneeId) {
      filters.assigneeId = assigneeId
    }

    if (typeof dueBefore === 'string' && dueBefore) {
      const dueDate = new Date(dueBefore)

      if (!Number.isNaN(dueDate.getTime())) {
        filters.dueDate = { lte: dueDate }
      }
    }

    if (typeof search === 'string' && search.trim()) {
      filters.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ]
    }

    const tasks = await prisma.task.findMany({
      where: filters,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
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

    response.json({
      project,
      tasks,
      teamMembers: project.team.members,
    })
  } catch (error) {
    next(error)
  }
})

projectsRouter.get('/:id/analytics', async (request, response, next) => {
  try {
    const project = await getProjectForUser(request.user!.id, request.params.id)

    if (!project) {
      response.status(404).json({ message: 'Project not found' })
      return
    }

    const tasks = await prisma.task.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        status: true,
        dueDate: true,
      },
    })

    const now = new Date()
    const total = tasks.length
    const done = tasks.filter((task) => task.status === TaskStatus.DONE).length
    const overdue = tasks.filter(
      (task) => task.dueDate && task.status !== TaskStatus.DONE && task.dueDate < now,
    ).length

    response.json({
      analytics: {
        total,
        done,
        overdue,
        completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
      },
    })
  } catch (error) {
    next(error)
  }
})
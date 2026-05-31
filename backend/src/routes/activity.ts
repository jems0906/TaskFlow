import { Router } from 'express'

import { prisma, publicUserSelect } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

export const activityRouter = Router()

activityRouter.use(requireAuth)

activityRouter.get('/', async (request, response, next) => {
  try {
    const activity = await prisma.taskActivity.findMany({
      where: {
        project: {
          team: {
            members: {
              some: { userId: request.user!.id },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        actor: {
          select: publicUserSelect,
        },
        project: {
          select: {
            id: true,
            name: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    })

    response.json({ activity })
  } catch (error) {
    next(error)
  }
})
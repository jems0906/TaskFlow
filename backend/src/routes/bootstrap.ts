import { Router } from 'express'

import { prisma, publicUserSelect } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

export const bootstrapRouter = Router()

bootstrapRouter.use(requireAuth)

bootstrapRouter.get('/', async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: publicUserSelect,
    })

    const teams = await prisma.team.findMany({
      where: {
        members: {
          some: { userId: request.user!.id },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: {
          include: {
            user: {
              select: publicUserSelect,
            },
          },
        },
        projects: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    })

    const notifications = await prisma.notification.findMany({
      where: {
        userId: request.user!.id,
        readAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
    })

    if (!user) {
      response.status(404).json({ message: 'User not found' })
      return
    }

    response.json({
      user,
      teams,
      notifications,
    })
  } catch (error) {
    next(error)
  }
})
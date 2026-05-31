import { TeamRole } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'

import { prisma, publicUserSelect } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const teamSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(240).optional(),
})

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const teamsRouter = Router()

teamsRouter.use(requireAuth)

teamsRouter.get('/', async (request, response, next) => {
  try {
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

    response.json({ teams })
  } catch (error) {
    next(error)
  }
})

teamsRouter.post('/', async (request, response, next) => {
  try {
    const payload = teamSchema.parse(request.body)
    const slugBase = slugify(payload.name)
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`

    const team = await prisma.team.create({
      data: {
        name: payload.name,
        description: payload.description,
        slug,
        members: {
          create: {
            userId: request.user!.id,
            role: TeamRole.ADMIN,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: publicUserSelect,
            },
          },
        },
        projects: true,
      },
    })

    response.status(201).json({ team })
  } catch (error) {
    next(error)
  }
})
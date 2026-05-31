import { Router } from 'express'
import { z } from 'zod'

import { hashPassword, signToken, verifyPassword } from '../lib/auth.js'
import { prisma, publicUserSelect } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const authSchema = z.object({
  name: z.string().min(2).max(60),
  email: z.email(),
  password: z.string().min(8).max(72),
})

const loginSchema = authSchema.pick({ email: true, password: true })

export const authRouter = Router()

authRouter.post('/register', async (request, response, next) => {
  try {
    const payload = authSchema.parse(request.body)
    const email = payload.email.toLowerCase()

    const existingUser = await prisma.user.findUnique({ where: { email } })

    if (existingUser) {
      response.status(409).json({ message: 'Email is already registered' })
      return
    }

    const user = await prisma.user.create({
      data: {
        name: payload.name,
        email,
        passwordHash: await hashPassword(payload.password),
      },
      select: publicUserSelect,
    })

    response.status(201).json({
      token: signToken(user.id),
      user,
    })
  } catch (error) {
    next(error)
  }
})

authRouter.post('/login', async (request, response, next) => {
  try {
    const payload = loginSchema.parse(request.body)
    const email = payload.email.toLowerCase()

    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
      response.status(401).json({ message: 'Invalid credentials' })
      return
    }

    response.json({
      token: signToken(user.id),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    next(error)
  }
})

authRouter.get('/me', requireAuth, async (request, response, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: request.user!.id },
      select: publicUserSelect,
    })

    if (!user) {
      response.status(404).json({ message: 'User not found' })
      return
    }

    response.json({ user })
  } catch (error) {
    next(error)
  }
})
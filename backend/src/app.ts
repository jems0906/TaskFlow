import cors from 'cors'
import express from 'express'
import { ZodError } from 'zod'

import { activityRouter } from './routes/activity.js'
import { authRouter } from './routes/auth.js'
import { bootstrapRouter } from './routes/bootstrap.js'
import { projectsRouter } from './routes/projects.js'
import { tasksRouter } from './routes/tasks.js'
import { teamsRouter } from './routes/teams.js'

export function createApp() {
  const app = express()

  app.use(
    cors({
      origin: process.env.CLIENT_URL ?? 'http://localhost:5173',
      credentials: true,
    }),
  )
  app.use(express.json())

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' })
  })

  app.use('/api/auth', authRouter)
  app.use('/api/bootstrap', bootstrapRouter)
  app.use('/api/teams', teamsRouter)
  app.use('/api/projects', projectsRouter)
  app.use('/api/tasks', tasksRouter)
  app.use('/api/activity', activityRouter)

  app.use((_request, response) => {
    response.status(404).json({ message: 'Route not found' })
  })

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof ZodError) {
      response.status(400).json({
        message: 'Validation failed',
        issues: error.flatten(),
      })
      return
    }

    console.error(error)
    response.status(500).json({ message: 'Internal server error' })
  })

  return app
}
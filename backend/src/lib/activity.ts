import { ActivityType } from '@prisma/client'

import { prisma } from './prisma.js'

type ActivityInput = {
  actorId?: string | null
  projectId: string
  taskId?: string | null
  type: ActivityType
  message: string
  metadata?: Record<string, unknown>
}

export async function recordActivity(input: ActivityInput) {
  return prisma.taskActivity.create({
    data: {
      actorId: input.actorId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      type: input.type,
      message: input.message,
      metadata: input.metadata as object | undefined,
    },
  })
}

export async function createAssignmentNotification(userId: string, taskId: string, message: string) {
  return prisma.notification.create({
    data: {
      userId,
      taskId,
      message,
    },
  })
}
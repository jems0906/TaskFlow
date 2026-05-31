import { ActivityType, TaskStatus, TeamRole } from '@prisma/client'

import { hashPassword } from '../src/lib/auth.js'
import { prisma } from '../src/lib/prisma.js'

async function main() {
  const [alex, maya, jordan] = await Promise.all([
    upsertUser('Alex Carter', 'alex@taskflow.local'),
    upsertUser('Maya Chen', 'maya@taskflow.local'),
    upsertUser('Jordan Singh', 'jordan@taskflow.local'),
  ])

  let team = await prisma.team.findUnique({ where: { slug: 'growth-ops' } })

  if (!team) {
    team = await prisma.team.create({
      data: {
        name: 'Growth Ops',
        slug: 'growth-ops',
        description: 'Internal delivery team for campaigns and onboarding flows.',
      },
    })
  }

  await prisma.teamMember.upsert({
    where: {
      teamId_userId: {
        teamId: team.id,
        userId: alex.id,
      },
    },
    update: { role: TeamRole.ADMIN },
    create: { teamId: team.id, userId: alex.id, role: TeamRole.ADMIN },
  })

  await Promise.all(
    [maya.id, jordan.id].map((userId) =>
      prisma.teamMember.upsert({
        where: {
          teamId_userId: { teamId: team.id, userId },
        },
        update: { role: TeamRole.MEMBER },
        create: { teamId: team.id, userId, role: TeamRole.MEMBER },
      }),
    ),
  )

  let project = await prisma.project.findFirst({ where: { name: 'Q3 Hiring Pipeline' } })

  if (!project) {
    project = await prisma.project.create({
      data: {
        name: 'Q3 Hiring Pipeline',
        description: 'Coordinate recruiter handoffs, interview loops, and offer approvals.',
        teamId: team.id,
        createdById: alex.id,
      },
    })
  }

  const taskCount = await prisma.task.count({ where: { projectId: project.id } })

  if (taskCount === 0) {
    const tasks = await prisma.$transaction([
      prisma.task.create({
        data: {
          projectId: project.id,
          creatorId: alex.id,
          assigneeId: maya.id,
          title: 'Map hiring manager requirements',
          description: 'Capture role scorecards and interview rubrics for each open req.',
          status: TaskStatus.IN_PROGRESS,
          dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
        },
      }),
      prisma.task.create({
        data: {
          projectId: project.id,
          creatorId: alex.id,
          assigneeId: jordan.id,
          title: 'Draft candidate outreach sequence',
          description: 'Prepare a two-step outreach with company positioning and compensation guardrails.',
          status: TaskStatus.TODO,
          dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
        },
      }),
      prisma.task.create({
        data: {
          projectId: project.id,
          creatorId: alex.id,
          assigneeId: alex.id,
          title: 'Publish weekly funnel review',
          description: 'Share sourced, screened, onsite, and offer metrics in the exec summary.',
          status: TaskStatus.DONE,
          completedAt: new Date(),
          dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
        },
      }),
    ])

    await prisma.taskComment.create({
      data: {
        taskId: tasks[0].id,
        authorId: maya.id,
        body: 'I have the scorecard draft. Waiting on one final interviewer note.',
      },
    })

    await prisma.taskActivity.createMany({
      data: [
        {
          projectId: project.id,
          taskId: tasks[0].id,
          actorId: alex.id,
          type: ActivityType.TASK_CREATED,
          message: 'created task Map hiring manager requirements',
        },
        {
          projectId: project.id,
          taskId: tasks[0].id,
          actorId: alex.id,
          type: ActivityType.TASK_ASSIGNED,
          message: 'assigned Map hiring manager requirements',
        },
        {
          projectId: project.id,
          taskId: tasks[2].id,
          actorId: alex.id,
          type: ActivityType.TASK_STATUS_CHANGED,
          message: 'moved Publish weekly funnel review to DONE',
        },
      ],
    })

    await prisma.notification.create({
      data: {
        userId: maya.id,
        taskId: tasks[0].id,
        message: 'You were assigned to Map hiring manager requirements',
      },
    })
  }
}

async function upsertUser(name: string, email: string) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash: await hashPassword('password123'),
    },
    create: {
      name,
      email,
      passwordHash: await hashPassword('password123'),
    },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
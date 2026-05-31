import { prisma, publicUserSelect } from './prisma.js'

export async function getTeamForUser(userId: string, teamId: string) {
  return prisma.team.findFirst({
    where: {
      id: teamId,
      members: {
        some: { userId },
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
      projects: {
        orderBy: { updatedAt: 'desc' },
      },
    },
  })
}

export async function getProjectForUser(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      team: {
        members: {
          some: { userId },
        },
      },
    },
    include: {
      team: {
        include: {
          members: {
            include: {
              user: {
                select: publicUserSelect,
              },
            },
          },
        },
      },
      createdBy: {
        select: publicUserSelect,
      },
    },
  })
}

export async function getTaskForUser(userId: string, taskId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        team: {
          members: {
            some: { userId },
          },
        },
      },
    },
    include: {
      project: {
        include: {
          team: {
            include: {
              members: {
                include: {
                  user: {
                    select: publicUserSelect,
                  },
                },
              },
            },
          },
        },
      },
      assignee: {
        select: publicUserSelect,
      },
      creator: {
        select: publicUserSelect,
      },
    },
  })
}
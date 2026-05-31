const baseUrl = process.env.API_BASE_URL ?? 'http://localhost:4000'
const seededEmail = process.env.SMOKE_EMAIL ?? 'alex@taskflow.local'
const seededPassword = process.env.SMOKE_PASSWORD ?? 'password123'

function fail(message) {
  throw new Error(message)
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options)
  const text = await response.text()
  let body = null

  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body)
    fail(`Request failed: ${options.method ?? 'GET'} ${path} -> ${response.status} ${detail}`)
  }

  return body
}

async function main() {
  const health = await request('/api/health')
  if (health?.status !== 'ok') {
    fail('Health check failed')
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: seededEmail, password: seededPassword }),
  })

  const token = login?.token
  if (!token) {
    fail('Login did not return a token')
  }

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const bootstrap = await request('/api/bootstrap', { headers: authHeaders })
  let firstTeam = bootstrap?.teams?.[0]
  let firstProject = firstTeam?.projects?.[0]

  if (!firstTeam?.id) {
    const teamResult = await request('/api/teams', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: `Smoke Team ${Date.now()}`,
        description: 'Created by backend smoke test',
      }),
    })
    firstTeam = teamResult?.team
  }

  if (!firstProject?.id) {
    const projectResult = await request('/api/projects', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        teamId: firstTeam?.id,
        name: `Smoke Project ${Date.now()}`,
        description: 'Created by backend smoke test',
      }),
    })
    firstProject = projectResult?.project
  }

  if (!firstProject?.id) {
    fail('No project available for smoke test')
  }

  const projectId = firstProject.id
  const stamp = Date.now()

  const created = await request('/api/tasks', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      projectId,
      title: `Smoke task ${stamp}`,
      description: 'Created by backend smoke test',
      assigneeId: null,
      dueDate: null,
    }),
  })

  const taskId = created?.task?.id
  if (!taskId) {
    fail('Task creation did not return task id')
  }

  const updated = await request(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({ status: 'IN_PROGRESS' }),
  })

  if (updated?.task?.status !== 'IN_PROGRESS') {
    fail('Task patch did not update status to IN_PROGRESS')
  }

  const comment = await request(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ body: 'Smoke test comment' }),
  })

  if (!comment?.comment?.id) {
    fail('Task comment creation failed')
  }

  await request(`/api/tasks/${taskId}`, {
    method: 'DELETE',
    headers: authHeaders,
  })

  const analytics = await request(`/api/projects/${projectId}/analytics`, {
    headers: authHeaders,
  })

  const activity = await request(`/api/activity?projectId=${projectId}`, {
    headers: authHeaders,
  })

  console.log('Smoke test passed')
  console.log(
    JSON.stringify(
      {
        baseUrl,
        user: bootstrap?.user?.email,
        projectId,
        analyticsTotal: analytics?.analytics?.total,
        activityCount: Array.isArray(activity?.activities) ? activity.activities.length : 0,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error('Smoke test failed')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

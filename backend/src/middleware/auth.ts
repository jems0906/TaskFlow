import type { NextFunction, Request, Response } from 'express'

import { verifyToken } from '../lib/auth.js'

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const authorization = request.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ message: 'Authentication required' })
    return
  }

  try {
    const token = authorization.slice('Bearer '.length)
    const { userId } = verifyToken(token)
    request.user = { id: userId }
    next()
  } catch {
    response.status(401).json({ message: 'Invalid token' })
  }
}
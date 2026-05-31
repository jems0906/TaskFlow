import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET ?? 'taskflow-dev-secret'

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash)
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string) {
  const payload = jwt.verify(token, JWT_SECRET)

  if (typeof payload === 'string' || !payload.sub) {
    throw new Error('Invalid token payload')
  }

  return {
    userId: payload.sub,
  }
}
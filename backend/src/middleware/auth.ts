import type { Request, Response, NextFunction } from 'express'
import { getAuth } from 'firebase-admin/auth'

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  )
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) {
    res.status(401).json({ error: 'Missing token' })
    return
  }
  try {
    const decoded = await getAuth().verifyIdToken(token)
    if (
      !decoded.email ||
      !decoded.email_verified ||
      !allowedEmails().has(decoded.email.toLowerCase())
    ) {
      console.warn('Rejected sign-in:', {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
      })
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  } catch (err) {
    const e = err as { code?: string; message?: string }
    console.warn('verifyIdToken failed:', e.code ?? e.message)
    res.status(401).json({ error: 'Invalid token' })
  }
}

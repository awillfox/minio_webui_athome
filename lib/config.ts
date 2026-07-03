type Env = Record<string, string | undefined>

export function loadConfig(env: Env) {
  const internalEndpoint = env.MINIO_INTERNAL_ENDPOINT
  const publicEndpoint = env.MINIO_PUBLIC_ENDPOINT
  const sessionSecret = env.SESSION_SECRET

  if (!internalEndpoint) throw new Error('MINIO_INTERNAL_ENDPOINT is required')
  if (!publicEndpoint) throw new Error('MINIO_PUBLIC_ENDPOINT is required')
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET is required and must be at least 32 characters')
  }

  const cookieSecure = env.COOKIE_SECURE?.toLowerCase() !== 'false'

  return {
    internalEndpoint,
    publicEndpoint,
    sessionSecret,
    cookieName: 'mw_session',
    cookieMaxAge: 60 * 60 * 8,
    cookieSecure,
  }
}

export const config = loadConfig(process.env)

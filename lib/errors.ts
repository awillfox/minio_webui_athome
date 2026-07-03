function nameOf(err: unknown): string {
  if (err && typeof err === 'object' && 'name' in err) return String((err as { name: unknown }).name)
  return ''
}

const AUTH_ERROR_NAMES = new Set(['InvalidAccessKeyId', 'SignatureDoesNotMatch', 'InvalidAccessKeyID'])

export function isAuthError(err: unknown): boolean {
  return AUTH_ERROR_NAMES.has(nameOf(err))
}

export function toUserMessage(err: unknown): string {
  const name = nameOf(err)
  if (AUTH_ERROR_NAMES.has(name)) return 'Invalid credentials'
  if (name === 'AccessDenied') return 'Not permitted'
  if (name === 'NoSuchBucket') return 'That bucket does not exist'
  if (name === 'BucketAlreadyOwnedByYou' || name === 'BucketAlreadyExists') return 'A bucket with that name already exists'
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return 'An unexpected error occurred'
}

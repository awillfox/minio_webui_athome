import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export type Creds = { accessKey: string; secretKey: string }

function keyFrom(secret: string): Buffer {
  // Derive a fixed 32-byte key from the configured secret.
  return createHash('sha256').update(secret).digest()
}

export function encryptSession(creds: Creds, secret: string): string {
  const key = keyFrom(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(creds), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url')
}

export function decryptSession(token: string, secret: string): Creds | null {
  try {
    const raw = Buffer.from(token, 'base64url')
    if (raw.length < 12 + 16 + 1) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    const parsed = JSON.parse(plaintext.toString('utf8'))
    if (typeof parsed?.accessKey !== 'string' || typeof parsed?.secretKey !== 'string') return null
    return { accessKey: parsed.accessKey, secretKey: parsed.secretKey }
  } catch {
    return null
  }
}

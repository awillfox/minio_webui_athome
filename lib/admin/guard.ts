/**
 * Rejects any user-controlled string that starts with '-' so it cannot be
 * misinterpreted as an mc flag when passed as a positional argument.
 * (execFile is used — no shell injection — but mc itself parses leading-dash
 * strings as flags before it sees positionals.)
 */
export function assertNotFlag(value: string, label: string): void {
  if (value.startsWith('-')) {
    throw new Error(`Invalid ${label}: must not start with '-'`)
  }
}

// Same rule as the server (member_password.go): 8 to 72 bytes, not just blanks.
export const PASSWORD_MIN = 8
export function passwordError(pw) {
  const v = String(pw || '')
  if (v.trim() === '' || [...v].length < PASSWORD_MIN) return 'short'
  if (new TextEncoder().encode(v).length > 72) return 'long'
  return ''
}

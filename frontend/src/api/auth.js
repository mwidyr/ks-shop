import client from './client'

export function requestLoginOtp(email) {
  return client.post('/auth/otp/request', { email }).then((res) => res.data)
}

export function verifyLoginOtp(email, code) {
  return client.post('/auth/otp/verify', { email, code }).then((res) => res.data)
}

export function forgotPassword(email) {
  return client.post('/auth/forgot-password', { email }).then((res) => res.data)
}

export function resetPassword(token, password) {
  return client.post('/auth/reset-password', { token, password }).then((res) => res.data)
}

export function acceptInvite(token, password) {
  return client.post('/auth/accept-invite', { token, password }).then((res) => res.data)
}

export function validateAuthToken(token) {
  return client.get(`/auth/tokens/${token}`).then((res) => res.data)
}

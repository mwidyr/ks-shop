import client from './client'

export function searchCustomers(q) {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return client.get(`/customers${query}`).then((res) => res.data)
}

export function createCustomer(payload) {
  return client.post('/customers', payload).then((res) => res.data)
}

export function listCustomerStats() {
  return client.get('/customers/stats').then((res) => res.data)
}

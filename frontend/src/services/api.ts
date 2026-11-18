export type ApiRole = 'supervisor' | 'admin' | 'user'

export type ApiUser = {
  id: string
  agencyId: string | null
  role: ApiRole
  name: string
  email: string
  nickname: string
  phone: string
  shamcash: string
}

export type ApiAgency = {
  id: string
  name: string
  location: string | null
  archivedAt: string | null
  members: number
  admins: number
  diamonds: number | string
}

export type ApiMember = ApiUser & {
  diamonds: number | string
  deliveryCount: number
}

export type ApiDelivery = {
  id: string
  userId: string
  diamonds: number | string
  deliveredAt: string
  screenshotUrl: string
}

type RequestOptions = {
  method?: string
  body?: unknown
  token?: string
}

const apiOrigin = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers()
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`)
  let body: BodyInit | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }
  const response = await fetch(`${apiOrigin}/api${path}`, {
    method: options.method || 'GET',
    headers,
    body,
  })
  const payload = response.status === 204 ? undefined : await response.json()
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`)
  return payload as T
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: { email, password } }),
  agencies: (token: string, includeArchived = false) =>
    request<ApiAgency[]>(`/agencies${includeArchived ? '?includeArchived=true' : ''}`, { token }),
  users: (token: string) => request<ApiMember[]>('/users', { token }),
  deliveries: (token: string) => request<ApiDelivery[]>('/deliveries', { token }),
  userDeliveries: (token: string, userId: string) => request<ApiDelivery[]>(`/users/${userId}/deliveries`, { token }),
  createAgency: (token: string, body: {
    name: string
    location: string
    admin: { name: string; email: string; password: string; phone: string }
  }) => request<ApiAgency>('/agencies', { method: 'POST', token, body }),
  updateAgency: (token: string, agencyId: string, body: { name: string; location: string }) =>
    request<{ id: string; name: string; location: string | null; archivedAt: string | null }>(`/agencies/${agencyId}`, { method: 'PATCH', token, body }),
  archiveAgency: (token: string, agencyId: string) =>
    request<void>(`/agencies/${agencyId}`, { method: 'DELETE', token }),
  resetPassword: (token: string, userId: string, password: string) =>
    request<void>(`/users/${userId}/password`, { method: 'PATCH', token, body: { password } }),
  createUser: (token: string, body: {
    name: string
    email: string
    password: string
    phone: string
    nickname: string
    agencyId?: string
    role?: ApiRole
  }) => request<ApiUser>('/users', { method: 'POST', token, body }),
  deleteUser: (token: string, userId: string) =>
    request<void>(`/users/${userId}`, { method: 'DELETE', token }),
  updateUser: (token: string, userId: string, body: { nickname: string; shamcash: string }) =>
    request<ApiUser>(`/users/${userId}`, { method: 'PATCH', token, body }),
  createDelivery: (token: string, diamonds: number, screenshot: File) => {
    const body = new FormData()
    body.set('diamonds', String(diamonds))
    body.set('screenshot', screenshot)
    return request<ApiDelivery>('/deliveries', { method: 'POST', token, body })
  },
}

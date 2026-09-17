/** Admin session client (JWT lives in an httpOnly cookie — JS never sees it). */
import { ApiRequestError, apiRequest } from './api';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function adminLogin(email: string, password: string): Promise<AdminUser> {
  const data = await apiRequest<{ user: AdminUser }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return data.user;
}

export async function adminLogout(): Promise<void> {
  await apiRequest<{ ok: boolean }>('/admin/logout', { method: 'POST' });
}

/** Returns the signed-in admin, or null when there is no session. */
export async function adminMe(): Promise<AdminUser | null> {
  try {
    const data = await apiRequest<{ user: AdminUser }>('/admin/me');
    return data.user;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) return null;
    throw err;
  }
}

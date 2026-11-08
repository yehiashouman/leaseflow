export type Role = 'ADMIN' | 'LEASING_MANAGER' | 'TENANT';
export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  status: string;
  leasingManager?: { fullName: string } | null;
  tenant?: { fullName: string } | null;
};
export const previewMode = import.meta.env.VITE_PREVIEW === 'true';
export const sessionKey = previewMode ? 'leaseflow-preview-token' : 'accessToken';
export const sessionOwnerKey = previewMode ? 'leaseflow-preview-owner' : 'leaseflow-session-owner';
let version = 0;
export const sessionVersion = () => version;
export function clearSessionStorage() {
  version++;
  sessionStorage.removeItem(sessionKey);
  sessionStorage.removeItem(sessionOwnerKey);
}
export function startSession(token: string) {
  clearSessionStorage();
  sessionStorage.setItem(sessionKey, token);
}

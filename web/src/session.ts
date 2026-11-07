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

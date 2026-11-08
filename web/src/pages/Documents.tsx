import { useAuth } from '../auth';
import { Documents } from '@/components/documents';
export function MyDocuments() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My private documents</h1>
      <p className="text-sm text-muted-foreground">
        Identity documents stay private to your account. Upload alone does not activate an account.
      </p>
      <Documents purpose="IDENTITY" targetId="self" heading="Identity documents" />
      {user?.role === 'LEASING_MANAGER' && (
        <Documents purpose="LICENSE" targetId="self" heading="Licence documents" />
      )}
    </div>
  );
}

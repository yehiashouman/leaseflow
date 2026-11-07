import { useState, type FormEvent } from 'react';
import { AlertCircle, Building2, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { previewMode } from '../session';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const auth = useAuth();
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await auth.login(email, password);
      navigate('/');
    } catch {
      setError('Unable to sign in. Verify your credentials and account status.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-svh place-items-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-center gap-2 text-xl font-semibold">
          <Building2 className="size-6 text-primary" aria-hidden="true" />
          LeaseFlow
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Sign in</h1>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {previewMode && (
              <div className="mb-5 flex flex-wrap gap-2">
                {['manager', 'admin', 'tenant'].map((role) => (
                  <Button
                    key={role}
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError('');
                      try {
                        await auth.login(role + '@preview.invalid', 'PreviewOnly123!');
                        navigate('/');
                      } catch {
                        setError('Preview account is unavailable.');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Preview {role}
                  </Button>
                ))}
              </div>
            )}
            <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
              {error && (
                <Alert variant="destructive" id="login-error">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={12}
                  aria-describedby={error ? 'login-error' : undefined}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                {busy ? 'Please wait...' : 'Sign in'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

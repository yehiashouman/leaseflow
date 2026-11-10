import { FormFieldErrors } from '../components/field-errors';
import { validationFields } from '../form-errors';
import { requestError } from '../api-errors';
import { useState, type FormEvent } from 'react';
import { AlertCircle, Building2, LoaderCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { previewMode } from '../session';

export function Login() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    setFieldErrors({});
    try {
      await auth.login(email, password);
      navigate('/');
    } catch (cause) {
      setFieldErrors(validationFields(cause));

      setError(
        requestError(cause, 'Unable to sign in. Verify your credentials and account status.'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormFieldErrors value={fieldErrors}>
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
                        setFieldErrors({});
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
              <div className="mt-5 grid gap-2 text-sm">
                <Link to="/forgot-password" className="text-primary underline">
                  Forgot password
                </Link>
                <Link to="/register" className="text-primary underline">
                  Register as Leasing Manager
                </Link>
                <Link to="/account-setup" className="text-primary underline">
                  Resume account setup
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </FormFieldErrors>
  );
}

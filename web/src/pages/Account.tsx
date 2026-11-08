import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { accountApi, setupSessionKey } from '../account-api';
import { previewMode } from '../session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Documents } from '@/components/documents';
import { QueryFeedback } from '@/components/query-feedback';

type Mode = 'register' | 'setup' | 'forgot' | 'reset' | 'verify' | 'invitation';
type Setup = {
  id: string;
  role: string;
  email: string;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  identityComplete: boolean;
  profile: Record<string, string | null>;
  moderationAvailable: boolean;
};
const headings: Record<Mode, string> = {
  register: 'Register as Leasing Manager',
  setup: 'Account setup',
  forgot: 'Password recovery',
  reset: 'Reset password',
  verify: 'Verify email',
  invitation: 'Tenant invitation',
};
const fieldClass = 'grid gap-2';
export function Account({ mode }: { mode: Mode }) {
  const location = useLocation();
  const navigate = useNavigate(),
    client = useQueryClient();
  const linkToken = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
  const [retainedToken, setRetainedToken] = useState(linkToken);
  const token = linkToken || retainedToken;
  const [session, setSession] = useState(() => Boolean(sessionStorage.getItem(setupSessionKey)));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  useEffect(() => {
    if (!linkToken) return;
    if (linkToken !== retainedToken) {
      client.removeQueries({ queryKey: ['invitation-inspect', retainedToken] });
      setRetainedToken(linkToken);
      setError('');
      setSuccess('');
    }
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, [client, linkToken, retainedToken]);
  const policy = useQuery({
    queryKey: ['account-policy'],
    enabled: !previewMode,
    queryFn: ({ signal }) =>
      accountApi.get('/auth/policy', { signal }).then((response) => response.data),
    retry: false,
  });
  const query = useQuery({
    queryKey: ['account-setup'],
    enabled: !previewMode && mode === 'setup' && session,
    queryFn: ({ signal }) =>
      accountApi.get<Setup>('/auth/setup/me', { signal }).then((response) => response.data),
    retry: false,
  });
  const invitation = useQuery({
    queryKey: ['invitation-inspect', token],
    enabled: !previewMode && mode === 'invitation' && Boolean(token),
    queryFn: () =>
      accountApi
        .post<{ email: string; fullName: string; managerName: string; expiresAt: string }>(
          '/invitations/inspect',
          { token },
        )
        .then((response) => response.data),
    retry: false,
  });
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
    } catch (cause) {
      setError(
        isAxiosError(cause)
          ? (cause.response?.data?.message ?? 'The request failed. Retry.') +
              (cause.response?.data?.requestId
                ? ' Reference: ' + cause.response.data.requestId
                : '')
          : 'The request failed. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  function submit(
    path: string,
    body: (form: FormData) => object,
    onSuccess?: (data: { accessToken?: string; message?: string }) => void,
  ) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void run(async () => {
        const { data } = await accountApi.post(path, body(form));
        onSuccess?.(data);
        setSuccess(data.message ?? 'Saved.');
        await client.invalidateQueries({ queryKey: ['account-setup'] });
      });
    };
  }
  function clearSetupCache() {
    client.removeQueries({ queryKey: ['account-setup'] });
    client.removeQueries({ queryKey: ['account-documents'] });
    client.removeQueries({ queryKey: ['invitation-inspect'] });
    client.removeQueries({ queryKey: ['document-policy', 'account-documents'] });
  }
  function startSession(data: { accessToken?: string }) {
    if (!data.accessToken) return;
    sessionStorage.setItem(setupSessionKey, data.accessToken);
    clearSetupCache();
    setSession(true);
    navigate('/account-setup');
  }
  const emailPassword = (
    <>
      <Field name="email" label="Email" type="email" />
      <Field name="password" label="Password" type="password" minLength={12} />
    </>
  );
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <Link to="/login" className="text-sm text-primary underline">
        Back to sign in
      </Link>
      <h1 className="text-2xl font-semibold">{headings[mode]}</h1>
      {previewMode ? (
        <p>Account setup and recovery require the live API and configured providers.</p>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && <p role="status">{success}</p>}
          {policy.isPending || policy.error ? (
            <QueryFeedback pending={policy.isPending} onRetry={() => void policy.refetch()} />
          ) : (
            <>
              {mode === 'register' && (
                <form
                  className="space-y-4"
                  onSubmit={submit(
                    '/auth/register/manager',
                    (form) => ({
                      email: form.get('email'),
                      password: form.get('password'),
                      fullName: form.get('fullName'),
                      dateOfBirth: form.get('dateOfBirth'),
                      nationality: form.get('nationality'),
                      phone: form.get('phone'),
                      declarationVersion: policy.data.declarationVersion,
                      declarationAccepted: form.get('declarationAccepted') === 'on',
                    }),
                    startSession,
                  )}
                >
                  {!policy.data.emailEnabled && (
                    <p role="status">Account email is not enabled on this server.</p>
                  )}
                  <Field name="fullName" label="Full legal name" maxLength={150} />
                  <Field name="dateOfBirth" label="Date of birth" type="date" />
                  <Field name="nationality" label="Nationality" maxLength={100} />
                  {emailPassword}
                  <Field name="phone" label="Mobile number" type="tel" placeholder="+971…" />
                  <div className="space-y-2 rounded-md border p-4">
                    <p className="text-sm">{policy.data.declarationText}</p>
                    <label className="flex items-start gap-2 text-sm">
                      <input name="declarationAccepted" type="checkbox" required className="mt-1" />
                      I accept this declaration.
                    </label>
                  </div>
                  <Button disabled={busy || !policy.data.emailEnabled}>
                    Create manager account
                  </Button>
                </form>
              )}
              {mode === 'forgot' && (
                <form
                  className="space-y-4"
                  onSubmit={submit('/auth/password/request', (form) => ({
                    email: form.get('email'),
                  }))}
                >
                  <Field name="email" label="Email" type="email" />
                  <Button disabled={busy || !policy.data.emailEnabled}>Request reset email</Button>
                  {!policy.data.emailEnabled && <p>Account email is not enabled on this server.</p>}
                </form>
              )}
              {mode === 'reset' &&
                (token ? (
                  <form
                    key={token}
                    className="space-y-4"
                    onSubmit={submit('/auth/password/reset', (form) => ({
                      token,
                      newPassword: form.get('newPassword'),
                    }))}
                  >
                    <Field name="newPassword" label="New password" type="password" minLength={12} />
                    <Button disabled={busy}>Reset password</Button>
                  </form>
                ) : (
                  <p role="alert">Open a valid reset link from your email.</p>
                ))}
              {mode === 'verify' && (
                <div className="space-y-4">
                  <p>Confirm the email address linked to this verification link.</p>
                  <Button
                    disabled={busy || !token}
                    onClick={() =>
                      void run(async () => {
                        const { data } = await accountApi.post('/auth/email/verify', { token });
                        setSuccess(data.message);
                      })
                    }
                  >
                    Verify email
                  </Button>
                  <p>
                    <Link to="/account-setup" className="text-primary underline">
                      Continue account setup
                    </Link>
                  </p>
                </div>
              )}
              {mode === 'invitation' &&
                (!token ? (
                  <p role="alert">Open the invitation link from your email.</p>
                ) : invitation.isPending || invitation.error ? (
                  <QueryFeedback
                    pending={invitation.isPending}
                    onRetry={() => void invitation.refetch()}
                  />
                ) : (
                  invitation.data && (
                    <form
                      className="space-y-4"
                      onSubmit={submit(
                        '/invitations/accept',
                        (form) => ({
                          token,
                          email: invitation.data.email,
                          fullName: form.get('fullName'),
                          password: form.get('password'),
                        }),
                        startSession,
                      )}
                    >
                      <p>
                        Invitation from {invitation.data.managerName} for {invitation.data.email}.
                      </p>
                      <p className="text-sm">Expiry: {invitation.data.expiresAt} UTC.</p>
                      <Field
                        name="fullName"
                        label="Full legal name"
                        defaultValue={invitation.data.fullName}
                      />
                      <Field name="password" label="Password" type="password" minLength={12} />
                      <Button disabled={busy}>Accept invitation</Button>
                    </form>
                  )
                ))}
              {mode === 'setup' &&
                (!session ? (
                  <form
                    className="space-y-4"
                    onSubmit={submit(
                      '/auth/setup/login',
                      (form) => ({ email: form.get('email'), password: form.get('password') }),
                      startSession,
                    )}
                  >
                    <p>Use your credentials to resume account setup.</p>
                    {emailPassword}
                    <Button disabled={busy}>Open account setup</Button>
                  </form>
                ) : query.isPending || query.error ? (
                  <div className="space-y-4">
                    <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
                    <Button
                      variant="outline"
                      onClick={() => {
                        sessionStorage.removeItem(setupSessionKey);
                        clearSetupCache();
                        setSession(false);
                      }}
                    >
                      Use another account
                    </Button>
                  </div>
                ) : (
                  query.data && (
                    <div className="space-y-6">
                      <section className="space-y-3 rounded-md border p-4">
                        <h2 className="text-lg font-semibold">Account status</h2>
                        <p>{query.data.email}</p>
                        <p>{query.data.status.replaceAll('_', ' ')}</p>
                        <p>
                          Email: {query.data.emailVerified ? 'Verified' : 'Not verified'} ·
                          WhatsApp: {query.data.phoneVerified ? 'Verified' : 'Not verified'} ·
                          Identity: {query.data.identityComplete ? 'Complete' : 'Incomplete'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Platform activation remains pending. It does not certify legal sufficiency
                          or authorization.
                        </p>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => void query.refetch()}
                        >
                          Refresh account status
                        </Button>
                        {!query.data.emailVerified && (
                          <Button
                            variant="outline"
                            disabled={busy || !policy.data.emailEnabled}
                            onClick={() =>
                              void run(async () => {
                                const { data } = await accountApi.post('/auth/email/resend', {});
                                setSuccess(data.message);
                              })
                            }
                          >
                            Resend verification email
                          </Button>
                        )}
                      </section>
                      {query.data.role === 'LEASING_MANAGER' && (
                        <Button
                          disabled={
                            busy ||
                            !query.data.emailVerified ||
                            !query.data.phoneVerified ||
                            !query.data.identityComplete
                          }
                          onClick={() =>
                            void run(async () => {
                              const { data } = await accountApi.post('/auth/setup/submit', {});
                              await query.refetch();
                              setSuccess(data.message);
                            })
                          }
                        >
                          Submit account for platform review
                        </Button>
                      )}
                      {query.data.emailVerified && !query.data.phoneVerified && (
                        <section className="space-y-4 rounded-md border p-4">
                          <h2 className="text-lg font-semibold">WhatsApp verification</h2>
                          <form
                            className="space-y-3"
                            onSubmit={submit('/auth/phone/start', (form) => ({
                              phone: form.get('phone'),
                            }))}
                          >
                            <Field
                              name="phone"
                              label="Your WhatsApp number"
                              type="tel"
                              defaultValue={query.data.profile?.pendingPhone ?? ''}
                            />
                            <Button disabled={busy || !policy.data.phoneEnabled}>
                              Request WhatsApp code
                            </Button>
                          </form>
                          {!policy.data.phoneEnabled && (
                            <p>WhatsApp verification requires the server's Twilio configuration.</p>
                          )}
                          <form
                            className="space-y-3"
                            onSubmit={submit('/auth/phone/confirm', (form) => ({
                              code: form.get('code'),
                            }))}
                          >
                            <Field
                              name="code"
                              label="WhatsApp code"
                              inputMode="numeric"
                              pattern="[0-9]{6}"
                              maxLength={6}
                            />
                            <Button disabled={busy || !policy.data.phoneEnabled}>
                              Confirm WhatsApp code
                            </Button>
                          </form>
                        </section>
                      )}
                      {query.data.emailVerified && (
                        <>
                          <form
                            className="grid gap-4 rounded-md border p-4 sm:grid-cols-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = new FormData(event.currentTarget);
                              void run(async () => {
                                const optional = (key: string) =>
                                  String(form.get(key) ?? '').trim() || null;
                                await accountApi.patch('/auth/setup/profile', {
                                  fullName: form.get('fullName'),
                                  dateOfBirth: form.get('dateOfBirth'),
                                  nationality: form.get('nationality'),
                                  emiratesIdNumber: form.get('emiratesIdNumber'),
                                  emiratesIdExpiry: form.get('emiratesIdExpiry'),
                                  ...Object.fromEntries(
                                    [
                                      'licenseType',
                                      'licenseNumber',
                                      'licenseIssuer',
                                      'licenseIssuedAt',
                                      'licenseExpiry',
                                    ].map((key) => [key, optional(key)]),
                                  ),
                                });
                                await query.refetch();
                                setSuccess('Profile saved.');
                              });
                            }}
                          >
                            <h2 className="text-lg font-semibold sm:col-span-2">
                              Identity details
                            </h2>
                            <Field
                              name="fullName"
                              label="Full legal name"
                              defaultValue={query.data.profile?.fullName ?? ''}
                            />
                            <Field
                              name="dateOfBirth"
                              label="Date of birth"
                              type="date"
                              defaultValue={query.data.profile?.dateOfBirth?.slice(0, 10) ?? ''}
                            />
                            <Field
                              name="nationality"
                              label="Nationality"
                              defaultValue={query.data.profile?.nationality ?? ''}
                            />
                            <Field
                              name="emiratesIdNumber"
                              label="Emirates ID number"
                              placeholder="784-0000-0000000-0"
                            />
                            <Field
                              name="emiratesIdExpiry"
                              label="Emirates ID expiry"
                              type="date"
                              defaultValue={
                                query.data.profile?.emiratesIdExpiry?.slice(0, 10) ?? ''
                              }
                            />
                            {query.data.role === 'LEASING_MANAGER' && (
                              <>
                                {[
                                  ['licenseType', 'Licence type'],
                                  ['licenseNumber', 'Licence number'],
                                  ['licenseIssuer', 'Issuing authority'],
                                  ['licenseIssuedAt', 'Licence issue date'],
                                  ['licenseExpiry', 'Licence expiry'],
                                ].map(([name, label]) => (
                                  <Field
                                    key={name}
                                    name={name}
                                    label={label}
                                    type={
                                      name === 'licenseIssuedAt' || name === 'licenseExpiry'
                                        ? 'date'
                                        : 'text'
                                    }
                                    required={false}
                                    defaultValue={
                                      query.data.profile?.[name]?.slice(
                                        0,
                                        name === 'licenseIssuedAt' || name === 'licenseExpiry'
                                          ? 10
                                          : undefined,
                                      ) ?? ''
                                    }
                                  />
                                ))}
                              </>
                            )}
                            <Button disabled={busy}>Save identity details</Button>
                          </form>
                          <Documents
                            purpose="IDENTITY"
                            targetId="self"
                            heading="Identity documents"
                            transport={accountApi}
                          />
                          {query.data.role === 'LEASING_MANAGER' && (
                            <Documents
                              purpose="LICENSE"
                              targetId="self"
                              heading="Licence documents"
                              transport={accountApi}
                            />
                          )}
                        </>
                      )}
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await accountApi.post('/auth/setup/logout', {});
                            sessionStorage.removeItem(setupSessionKey);
                            clearSetupCache();
                            setSession(false);
                          })
                        }
                      >
                        End account setup session
                      </Button>
                    </div>
                  )
                ))}
            </>
          )}
        </>
      )}
    </main>
  );
}
function Field({
  name,
  label,
  required = true,
  ...props
}: React.ComponentProps<'input'> & { name: string; label: string }) {
  return (
    <div className={fieldClass}>
      <Label htmlFor={'account-' + name}>
        {label}
        {!required && ' (optional)'}
      </Label>
      <Input id={'account-' + name} name={name} required={required} {...props} />
    </div>
  );
}

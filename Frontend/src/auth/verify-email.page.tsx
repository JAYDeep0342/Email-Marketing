import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuthMutations } from '@/auth/use-auth-mutations';
import { normalizeAxiosError } from '@/lib/api';

/**
 * Email verification landing.
 *
 * User clicks the link in the verification email
 * (/auth/verify-email?token=xxx). We call the backend once on mount and
 * show one of three states: pending, ok, error.
 *
 * The useRef guard prevents React 18 StrictMode from firing the
 * mutation twice in dev (StrictMode intentionally double-invokes
 * effects). Without it a fresh token would be marked "used" on the
 * first call and 400 on the second, showing a spurious error.
 */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { verifyEmail } = useAuthMutations();

  const [state, setState] = useState<'verifying' | 'ok' | 'error' | 'missing'>(
    token ? 'verifying' : 'missing',
  );
  const [errorMsg, setErrorMsg] = useState<string>('');
  const firedRef = useRef(false);

  useEffect(() => {
    if (!token || firedRef.current) return;
    firedRef.current = true;

    verifyEmail
      .mutateAsync({ token })
      .then(() => setState('ok'))
      .catch((err) => {
        setErrorMsg(normalizeAxiosError(err).message);
        setState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'missing') {
    return (
      <StatusBlock
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Missing token"
        body="This verification link is incomplete."
        cta={
          <Button asChild variant="outline" className="w-full">
            <Link to="/auth/login">Back to sign in</Link>
          </Button>
        }
      />
    );
  }

  if (state === 'verifying') {
    return (
      <StatusBlock
        icon={<Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />}
        title="Verifying your email…"
        body="This should only take a moment."
      />
    );
  }

  if (state === 'ok') {
    return (
      <StatusBlock
        icon={<CheckCircle2 className="h-10 w-10 text-primary" />}
        title="Email verified"
        body="You're all set. Sign in to continue."
        cta={
          <Button asChild className="w-full">
            <Link to="/auth/login">Continue to sign in</Link>
          </Button>
        }
      />
    );
  }

  return (
    <StatusBlock
      icon={<XCircle className="h-10 w-10 text-destructive" />}
      title="Verification failed"
      body={errorMsg || 'This link may be invalid or expired.'}
      cta={
        <Button asChild variant="outline" className="w-full">
          <Link to="/auth/login">Back to sign in</Link>
        </Button>
      }
    />
  );
}

/** Shared 3-part status block: icon on top, title, body, optional CTA. */
function StatusBlock({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">{icon}</div>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
      {cta}
    </div>
  );
}

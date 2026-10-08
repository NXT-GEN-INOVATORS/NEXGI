import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Divider, CircularProgress } from '@mui/material';

// ── Default operator credentials (auto-filled) ─────────────────────────────
const DEFAULT_EMAIL = 'vijay6432e@gmail.com';
const DEFAULT_PASSWORD = '1234';

// ── Demo user — used when Supabase is offline so ALL pages work freely ──────
const DEMO_USER: User = {
  id: 'demo-operator-001',
  email: DEFAULT_EMAIL,
  app_metadata: {},
  user_metadata: { name: 'Vijay' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

type Destination = '/dashboard' | '/ai-search' | '/video-intelligence';
const destinationKey = 'visiontrace-signin-destination';

function savedDestination(): Destination | null {
  const value = sessionStorage.getItem(destinationKey);
  return value === '/dashboard' || value === '/ai-search' || value === '/video-intelligence' ? value : null;
}

const Context = createContext<{
  user: User | null;
  ready: boolean;
  signIn: (to?: Destination) => void;
  signOut: () => Promise<void>;
  dbOnline: boolean;
}>({ user: null, ready: false, signIn: () => {}, signOut: async () => {}, dbOnline: false });

export const useSession = () => useContext(Context);

export function SessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(DEMO_USER);
  const [ready, setReady] = useState(true);
  const [open, setOpen] = useState(false);
  const [signup, setSignup] = useState(false);
  // Pre-fill credentials
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dbOnline, setDbOnline] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

  useEffect(() => {
    let active = true;

    function establish(next: User | null) {
      if (!active) return;
      setUser(next);
      setReady(true);
      if (next) {
        const to = savedDestination();
        if (to) {
          sessionStorage.removeItem(destinationKey);
          setOpen(false);
          void navigate({ to, replace: true });
        }
      }
    }

    supabase.auth.getSession().then(({ data }: { data: any }) => {
      const sessionUser = data.session?.user ?? null;
      if (!sessionUser) {
        // No Supabase session — run as demo operator (all pages unlocked)
        setDemoMode(true);
        establish(DEMO_USER);
      } else {
        establish(sessionUser);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        setDemoMode(false);
        establish(session.user);
      }
      // Don't reset to null on auth change when in demo mode
    });

    supabase.from('videos').select('id').limit(1).then(({ error: e }: { error: any }) => {
      if (active) setDbOnline(!e);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [navigate]);

  function signIn(to: Destination = '/dashboard') {
    if (user) { void navigate({ to }); return; }
    sessionStorage.setItem(destinationKey, to);
    setError('');
    setSignup(false);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
    sessionStorage.removeItem(destinationKey);
  }

  async function signOut() {
    if (demoMode) {
      // In demo mode just navigate home
      setUser(null);
      setReady(false);
      void navigate({ to: '/' });
      setTimeout(() => { setDemoMode(true); setUser(DEMO_USER); setReady(true); }, 100);
      return;
    }
    const { error: e } = await supabase.auth.signOut();
    if (e) { setError(e.message); setOpen(true); return; }
    sessionStorage.removeItem(destinationKey);
    setUser(DEMO_USER);
    setDemoMode(true);
    void navigate({ to: '/' });
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (demoMode) {
        // In demo mode, accept default creds immediately
        if (email === DEFAULT_EMAIL && password === DEFAULT_PASSWORD) {
          setOpen(false);
          const to = savedDestination();
          if (to) { sessionStorage.removeItem(destinationKey); void navigate({ to, replace: true }); }
          return;
        }
      }
      const result = signup
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) { setError(result.error.message); return; }
      if (signup && !result.data.session) { setError('Check your email to confirm your account before signing in.'); return; }
      setOpen(false);
    } catch {
      setError('Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError('');
    try {
      const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin });
      if (result.error) setError(result.error.message);
      else if (!result.redirected) setOpen(false);
    } catch {
      setError('Google sign-in is unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Context.Provider value={{ user, ready, signIn, signOut, dbOnline }}>
      {ready ? children : <div className="session-loading"><CircularProgress aria-label="Opening workspace" /></div>}
      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>{signup ? 'Create an operator account' : 'Welcome to NEXGI Vision'}</DialogTitle>
        <DialogContent>
          <p className="subtitle">{signup ? 'Create your private workspace.' : 'Sign in to your workspace.'}</p>
          {demoMode && !error && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Demo mode — credentials pre-filled. Click <strong>Sign in</strong> to continue.
            </Alert>
          )}
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <form onSubmit={e => { e.preventDefault(); void submit(); }}>
            <TextField margin="normal" fullWidth required label="Email" type="email" autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)} />
            <TextField margin="normal" fullWidth required label="Password" type="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password} onChange={e => setPassword(e.target.value)} />
            <Button fullWidth variant="contained" type="submit" disabled={busy || !email || password.length < 4}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
            </Button>
          </form>
          <Divider sx={{ my: 2 }}>or</Divider>
          <Button fullWidth variant="outlined" disabled={busy} onClick={google}>Continue with Google</Button>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => { setSignup(!signup); setError(''); }}>
            {signup ? 'Already have an account?' : 'Create an account'}
          </Button>
          <Button disabled={busy} onClick={close}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Context.Provider>
  );
}

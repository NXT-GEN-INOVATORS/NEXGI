import { Button } from '@mui/material';
import { ArrowForward, AutoAwesomeOutlined } from '@mui/icons-material';
import { Link } from '@tanstack/react-router';
import { useSession } from './Session';

export function PublicShell({ children }: { children: React.ReactNode }) {
  const { user, signIn } = useSession();
  return (
    <div className="public-site">
      <header className="public-header">
        {/* Brand — NEXGI Vision (no Lovable icon) */}
        <Link to="/" className="public-brand">
          <span className="brand-icon nexgi-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="4" fill="currentColor" opacity="0.8" />
              <line x1="12" y1="2" x2="12" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="2" y1="12" x2="6" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="18" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="19.07" y1="4.93" x2="16.24" y2="7.76" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="7.76" y1="16.24" x2="4.93" y2="19.07" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <span>
            NEXGI <span className="brand-ai">Vision</span>
          </span>
        </Link>

        <nav aria-label="Public navigation">
          <Button component={Link} to="/" activeProps={{ className: 'public-nav-active' }}>
            Home
          </Button>
          <Button component={Link} to="/cameras" activeProps={{ className: 'public-nav-active' }}>
            Cameras
          </Button>
          <Button component={Link} to="/about" activeProps={{ className: 'public-nav-active' }}>
            About
          </Button>
        </nav>

        {user ? (
          <Button component={Link} to="/dashboard" variant="contained" endIcon={<ArrowForward />}>
            Dashboard
          </Button>
        ) : (
          <Button variant="contained" onClick={() => signIn('/dashboard')}>
            Sign in <ArrowForward sx={{ fontSize: 18, ml: 1 }} />
          </Button>
        )}
      </header>

      <main>{children}</main>

      <footer className="public-footer">
        <span>© 2026 NEXGI Vision AI</span>
        <span>Video Intelligence · In 3D</span>
        <Link to="/about">About</Link>
      </footer>

      <div className="ai-dock public-ai-dock">
        {user ? (
          <Button component={Link} to="/ai-search" variant="contained" startIcon={<AutoAwesomeOutlined />} endIcon={<ArrowForward />}>
            Ask your CCTV
          </Button>
        ) : (
          <Button onClick={() => signIn('/ai-search')} variant="contained" startIcon={<AutoAwesomeOutlined />} endIcon={<ArrowForward />}>
            Ask your CCTV
          </Button>
        )}
      </div>
    </div>
  );
}

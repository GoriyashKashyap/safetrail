import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { initials } from '../../utils/format.js';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/guardians', label: 'Guardians', icon: Users },
  { to: '/watching', label: 'Watching', icon: Eye },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
      isActive ? 'bg-shield-50 text-shield-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <span className="w-9 h-9 rounded-xl bg-shield-600 flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </span>
              <span className="font-display font-bold text-lg text-slate-900">SafeTrail</span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={linkClass}>
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-2">
              <Link to="/trips/new" className="btn-primary flex items-center gap-1.5 text-sm">
                <Plus className="w-4 h-4" />
                New trip
              </Link>
              <div className="flex items-center gap-2 pl-2 border-l border-slate-100">
                <span className="w-8 h-8 rounded-full bg-shield-100 text-shield-700 text-xs font-bold flex items-center justify-center">
                  {initials(user?.name)}
                </span>
                <button onClick={handleLogout} className="btn-ghost !px-2" title="Sign out">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              className="md:hidden btn-ghost !px-2"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-1">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={linkClass}
                onClick={() => setMenuOpen(false)}
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
            <Link
              to="/trips/new"
              className="btn-primary flex items-center justify-center gap-1.5 text-sm mt-2"
              onClick={() => setMenuOpen(false)}
            >
              <Plus className="w-4 h-4" />
              New trip
            </Link>
            <button onClick={handleLogout} className="btn-ghost w-full flex items-center gap-2 justify-start">
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

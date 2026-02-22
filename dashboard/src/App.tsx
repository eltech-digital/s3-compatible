import { BrowserRouter, Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, Key, Database, HardDrive, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import KeysPage from './pages/KeysPage';
import BucketsPage from './pages/BucketsPage';
import ObjectBrowserPage from './pages/ObjectBrowserPage';

const queryClient = new QueryClient();

function Sidebar() {
  const { logout } = useAuth();
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <HardDrive size={24} />
          <span>S3 Dashboard</span>
          <span className="badge badge-accent" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 4 }}>ADMIN</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={18} />
          <span className="nav-label">Dashboard</span>
        </NavLink>
        <NavLink to="/keys" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Key size={18} />
          <span className="nav-label">Access Keys</span>
        </NavLink>
        <NavLink to="/buckets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Database size={18} />
          <span className="nav-label">Buckets</span>
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <button className="nav-item" onClick={logout} style={{ color: 'var(--danger)' }}>
          <LogOut size={18} />
          <span className="nav-label">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/keys" element={<KeysPage />} />
          <Route path="/buckets" element={<BucketsPage />} />
          <Route path="/buckets/:bucket" element={<ObjectBrowserPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

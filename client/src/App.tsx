import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import {
  FileText, Users, Search, Camera, LayoutDashboard, Menu, X, BarChart2, LogOut, MapPin
} from 'lucide-react';
import { useState } from 'react';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import InvoicesPage from './pages/InvoicesPage';
import InvoiceDetailPage from './pages/InvoiceDetailPage';
import InvoiceFormPage from './pages/InvoiceFormPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import SearchPage from './pages/SearchPage';
import CameraCapturePage from './pages/CameraCapturePage';
import DashboardPage from './pages/DashboardPage';
import AnalyticsPage from './pages/AnalyticsPage';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/invoices', icon: FileText, label: 'Invoices' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/capture', icon: Camera, label: 'Capture' },
];

// Role badge colors
const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-yellow-500/20 text-yellow-300',
  admin: 'bg-purple-500/20 text-purple-300',
  staff: 'bg-blue-500/20 text-blue-300',
};

function ProtectedApp() {
  const { user, logout, isLoading } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const roleColor = ROLE_COLORS[user.role] || ROLE_COLORS.staff;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-56 flex flex-col bg-gray-900 text-white
          transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0
        `}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-400" />
            <span className="font-bold text-sm tracking-wide">InvoiceTracker</span>
          </div>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-3 border-t border-gray-700 space-y-2">
          <div className="px-1">
            <div className="text-sm font-medium text-white">{user.displayName}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${roleColor}`}>
                {user.role}
              </span>
            </div>
            {user.locationLabel && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                <MapPin className="w-3 h-3" />
                {user.locationLabel}
              </div>
            )}
            {!user.locationLabel && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                <MapPin className="w-3 h-3" />
                All locations
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar (mobile only) */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-600 hover:text-gray-900"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-semibold text-gray-800">InvoiceTracker</span>
          {user.locationLabel && (
            <span className="ml-auto text-xs text-gray-500 flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {user.locationLabel}
            </span>
          )}
        </header>

        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/new" element={<InvoiceFormPage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="/invoices/:id/edit" element={<InvoiceFormPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/capture" element={<CameraCapturePage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPageWrapper />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

// Redirect already-logged-in users away from /login
function LoginPageWrapper() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return <LoginPage />;
}

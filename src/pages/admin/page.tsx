import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import DeveloperDashboard from './components/DeveloperDashboard';

export default function Admin() {
  const { session, loading, error, signIn, signOut, resetPassword, isDeveloper } = useAdminAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<'desarrollo' | 'gestion'>('desarrollo');

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-foreground-400">Cargando…</div>;
  }

  if (!session) {
    return <AdminLogin signIn={signIn} error={error} resetPassword={resetPassword} />;
  }

  if (!isDeveloper) {
    return <AdminDashboard onSignOut={handleSignOut} />;
  }

  return view === 'gestion' ? (
    <AdminDashboard
      onSignOut={handleSignOut}
      viewSwitch={{ label: 'Panel de desarrollo', onClick: () => setView('desarrollo') }}
    />
  ) : (
    <DeveloperDashboard
      onSignOut={handleSignOut}
      viewSwitch={{ label: 'Panel de gestión', onClick: () => setView('gestion') }}
    />
  );
}

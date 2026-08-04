import { useAdminAuth } from '@/hooks/useAdminAuth';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';

export default function Admin() {
  const { session, loading, error, signIn, signOut } = useAdminAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-foreground-400">Cargando…</div>;
  }

  if (!session) {
    return <AdminLogin signIn={signIn} error={error} />;
  }

  return <AdminDashboard onSignOut={signOut} />;
}

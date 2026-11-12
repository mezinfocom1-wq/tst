import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth';
import { Loading } from '../src/ui';

/** Aiguillage selon le rôle : la consultation des salons est possible sans compte. */
export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return <Redirect href={user?.role === 'PROFESSIONAL' ? '/(pro)/today' : '/(client)/explore'} />;
}

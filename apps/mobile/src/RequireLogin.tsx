import { usePathname, useRouter } from 'expo-router';
import { useAuth } from './auth';
import { useI18n } from './i18n';
import { Button, Card, Loading, Muted } from './ui';

/** Affiche le contenu aux utilisateurs connectés, sinon une invitation à se connecter. */
export function RequireLogin({ children, message }: { children: React.ReactNode; message?: string }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  if (loading) return <Loading />;
  if (user) return <>{children}</>;
  return (
    <Card style={{ gap: 12 }}>
      <Muted>{message ?? t('Connectez-vous pour continuer')}</Muted>
      <Button title={t('Connexion')} onPress={() => router.push({ pathname: '/login', params: { next: pathname } })} />
      <Button variant="outline" title={t('Créer un compte')} onPress={() => router.push({ pathname: '/register', params: { next: pathname } })} />
    </Card>
  );
}

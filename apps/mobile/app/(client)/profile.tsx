import { useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { useAuth } from '../../src/auth';
import { useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { Button, Card, Muted, Screen, Title, styles } from '../../src/ui';

export function LanguageSwitch() {
  const { locale, t, setLocale } = useI18n();
  return (
    <Button variant="outline" title={locale === 'fr' ? 'العربية' : 'Français'} onPress={async () => {
      if (await setLocale(locale === 'fr' ? 'ar' : 'fr')) Alert.alert('Salonat', t('Redémarrez l’application pour appliquer le sens d’affichage de la langue.'));
    }} />
  );
}

export default function Profile() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const router = useRouter();
  return (
    <Screen>
      <Title>{t('Profil')}</Title>
      <RequireLogin>
        {user && (
          <Card style={{ gap: 4 }}>
            <Text style={[styles.text, { fontWeight: '700', fontSize: 18 }]}>{user.firstName} {user.lastName}</Text>
            <Muted>{user.email}</Muted>
            {user.phone && <Muted>{user.phone}</Muted>}
            {!user.emailVerified && <Muted style={{ color: '#a65f00' }}>{t('Adresse email non confirmée.')}</Muted>}
          </Card>
        )}
        <Button variant="outline" title={t('Déconnexion')} onPress={async () => { await signOut(); router.replace('/'); }} />
      </RequireLogin>
      <LanguageSwitch />
    </Screen>
  );
}

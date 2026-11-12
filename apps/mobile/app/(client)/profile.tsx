import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { useI18n } from '../../src/i18n';
import { RequireLogin } from '../../src/RequireLogin';
import { Button, Card, Field, Muted, Notice, Screen, Subtitle, Title, styles, useAction } from '../../src/ui';

export function LanguageSwitch() {
  const { locale, t, setLocale } = useI18n();
  return (
    <Button variant="outline" title={locale === 'fr' ? 'العربية' : 'Français'} onPress={async () => {
      if (await setLocale(locale === 'fr' ? 'ar' : 'fr')) Alert.alert('Salonat', t('Redémarrez l’application pour appliquer le sens d’affichage de la langue.'));
    }} />
  );
}

/** Suppression du compte depuis l'application (exigée par les boutiques d'applications). */
export function DeleteAccount() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const action = useAction();
  if (!open) return <Button variant="ghost" title={t('Supprimer mon compte')} onPress={() => setOpen(true)} />;
  return (
    <Card style={{ gap: 10 }}>
      <Subtitle>{t('Supprimer mon compte')}</Subtitle>
      <Notice tone="warn">{t('Cette action est définitive : vos rendez-vous à venir et vos tickets seront annulés, vos points de fidélité perdus.')}</Notice>
      <Field label={t('Mot de passe')} value={password} onChangeText={setPassword} secureTextEntry />
      {action.error && <Notice>{action.error}</Notice>}
      <Button title={t('Supprimer définitivement')} busy={action.busy} onPress={() => Alert.alert(t('Supprimer mon compte'), undefined, [
        { text: t('Annuler'), style: 'cancel' },
        { text: t('Supprimer définitivement'), style: 'destructive', onPress: () => action.run(async () => { await api('/me/delete', { body: { password: password || undefined } }); await signOut(); router.replace('/'); }) },
      ])} />
      <Button variant="outline" title={t('Annuler')} onPress={() => setOpen(false)} />
    </Card>
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
        <DeleteAccount />
      </RequireLogin>
      <LanguageSwitch />
    </Screen>
  );
}

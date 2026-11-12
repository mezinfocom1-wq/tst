import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { useI18n } from '../src/i18n';
import { Button, Field, Muted, Notice, Screen, Title, useAction } from '../src/ui';

export default function Register() {
  const { locale, t } = useI18n();
  const { signIn } = useAuth();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const action = useAction();
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  return (
    <Screen>
      <Title>{t('Créer un compte')}</Title>
      <Muted>{t('Réservez et suivez votre file d’attente en quelques secondes.')}</Muted>
      <Field label={t('Prénom')} value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" />
      <Field label={t('Nom')} value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" />
      <Field label={t('Adresse email')} value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('Téléphone (facultatif)')} value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="06XXXXXXXX" />
      <Field label={`${t('Mot de passe')} (${t('8 caractères minimum')})`} value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" />
      {action.error && <Notice>{action.error}</Notice>}
      <Button title={t('Créer mon compte')} busy={action.busy} disabled={!form.firstName || !form.lastName || !form.email || form.password.length < 8}
        onPress={() => action.run(async () => {
          const session = await api('/auth/register', { body: { ...form, email: form.email.trim(), phone: form.phone || undefined, locale } });
          await signIn(session);
          router.replace((next as never) ?? '/');
        })} />
    </Screen>
  );
}

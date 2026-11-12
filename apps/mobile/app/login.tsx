import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { useI18n } from '../src/i18n';
import { colors } from '../src/theme';
import { Button, Field, Muted, Notice, Screen, Title, useAction } from '../src/ui';

export default function Login() {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const action = useAction();
  return (
    <Screen>
      <Title>{t('Connexion')}</Title>
      <Muted>{t('Heureux de vous revoir.')}</Muted>
      <Field label={t('Adresse email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={t('Mot de passe')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      {action.error && <Notice>{action.error}</Notice>}
      <Button title={t('Se connecter')} busy={action.busy} disabled={!email || !password} onPress={() => action.run(async () => {
        const session = await api('/auth/login', { body: { email: email.trim(), password } });
        await signIn(session);
        router.replace((next as never) ?? '/');
      })} />
      <Link href={{ pathname: '/register', params: next ? { next } : {} }} style={{ textAlign: 'center', marginTop: 12 }}>
        <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 15 }}>{t('Créer un compte')}</Text>
      </Link>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { Text } from 'react-native';
import { useAuth } from '../../src/auth';
import { useI18n } from '../../src/i18n';
import { Badge, Button, Card, Loading, Muted, Screen, Title, styles, useApi } from '../../src/ui';
import { DeleteAccount, LanguageSwitch } from '../(client)/profile';

const STATUS: Record<string, string> = {
  DRAFT: 'Brouillon', PENDING_REVIEW: 'En attente de vérification', INFO_REQUESTED: 'Informations complémentaires demandées',
  APPROVED: 'Approuvé', REJECTED: 'Refusé', SUSPENDED: 'Suspendu',
};

export default function More() {
  const { t } = useI18n();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { data: salon, loading, reload } = useApi<any>('/pro/salon');
  return (
    <Screen onRefresh={reload}>
      <Title>{t('Mon salon')}</Title>
      {loading ? <Loading /> : salon ? (
        <Card style={{ gap: 8 }}>
          <Text style={[styles.text, { fontWeight: '700', fontSize: 18 }]}>{salon.name}</Text>
          <Badge tone={salon.published ? 'ok' : 'warn'}>{salon.published ? t('Visible dans la marketplace') : t(STATUS[salon.status])}</Badge>
          <Muted>{salon.subscription ? `${t('Abonnement')} : ${salon.subscription.plan}` : t('Activer votre abonnement')}</Muted>
          <Muted>{t('La gestion complète (prestations, équipe, horaires, abonnement, statistiques) se fait depuis le site Web.')}</Muted>
        </Card>
      ) : <Muted>{t('Créez votre salon depuis le site Web pour commencer.')}</Muted>}
      {/* Un professionnel garde les capacités d'un client dans les autres salons. */}
      <Button variant="outline" title={t('Trouver un salon')} onPress={() => router.push('/(client)/explore')} />
      <Card style={{ gap: 2 }}><Text style={[styles.text, { fontWeight: '600' }]}>{user?.firstName} {user?.lastName}</Text><Muted>{user?.email}</Muted></Card>
      <LanguageSwitch />
      <Button variant="outline" title={t('Déconnexion')} onPress={async () => { await signOut(); router.replace('/'); }} />
      <DeleteAccount />
    </Screen>
  );
}

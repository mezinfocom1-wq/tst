import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { useI18n } from '../src/i18n';
import { Button, Muted, Screen, Title } from '../src/ui';

/** Scanne le QR Code d'un salon : il contient l'adresse de sa file d'attente et le jeton « sur place ». */
export default function Scan() {
  const { t } = useI18n();
  const router = useRouter();
  const [permission, request] = useCameraPermissions();
  const handled = useRef(false);

  const onScan = ({ data }: { data: string }) => {
    if (handled.current) return;
    const match = /\/salons\/([\w-]+)\/queue(?:\?.*?\bqr=([\w-]+))?/.exec(data);
    if (!match) return;
    handled.current = true;
    router.replace({ pathname: '/queue/[slug]', params: { slug: match[1], ...(match[2] ? { qr: match[2] } : {}) } });
  };

  return (
    <Screen scroll={false}>
      <Title>{t('QR Code du salon')}</Title>
      {!permission?.granted ? (
        <>
          <Muted>{t('Autorisez l’appareil photo pour scanner le QR Code affiché dans le salon.')}</Muted>
          <Button title={t('Autoriser l’appareil photo')} onPress={request} />
        </>
      ) : (
        <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={onScan} />
        </View>
      )}
      <Button variant="outline" title={t('Annuler')} onPress={() => router.back()} />
    </Screen>
  );
}

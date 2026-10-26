import { isBarcode } from '@peakr/engine';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Meal } from '@/features/body/meals';
import { Button, Card, ListState, Screen, spacing, Text } from '@/ui';

import { useLookupBarcode } from '../queries';
import { OffAttribution } from './food-row';

/**
 * Barcode scan: the camera (permission asked here, only when the user opens the scanner) reads
 * EAN / UPC codes; the product comes from the own foods, the local cache or Open Food Facts.
 * Unknown products can be created with the barcode, so the next scan finds them.
 */
export function ScanScreen({ meal, day }: { meal: Meal; day: string }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const lookup = useLookupBarcode();
  const [code, setCode] = useState<string | null>(null);
  const [result, setResult] = useState<'notFound' | 'offline' | null>(null);
  const busy = useRef(false);

  const onCode = (data: string) => {
    if (busy.current || !isBarcode(data)) return;
    busy.current = true;
    setCode(data);
    lookup.mutate(data, {
      onSuccess: (r) => {
        if (r.status === 'found') {
          router.replace({ pathname: '/body/food/[id]', params: { id: r.food.id, meal, day } });
        } else {
          setResult(r.status);
        }
      },
      onSettled: () => {
        busy.current = false;
      },
    });
  };

  if (!permission) return <ListState kind="loading" label={t('common.loading')} />;
  if (!permission.granted) {
    return (
      <Screen>
        <Card style={styles.card}>
          <Text>{t('bodyAddon.food.cameraWhy')}</Text>
          <Button
            label={t('bodyAddon.food.cameraAllow')}
            onPress={() => void requestPermission()}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      {result === null ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={lookup.isPending ? undefined : ({ data }) => onCode(data)}
            testID="food-camera"
          />
        </View>
      ) : (
        <Card style={styles.card} testID={`scan-${result}`}>
          <Text>
            {t(
              result === 'notFound' ? 'bodyAddon.food.scanNotFound' : 'bodyAddon.food.scanOffline',
              { code },
            )}
          </Text>
          <Button
            variant="secondary"
            label={t('bodyAddon.food.createWithBarcode')}
            onPress={() =>
              router.replace({
                pathname: '/body/food/new',
                params: { barcode: code ?? '', meal, day },
              })
            }
          />
          <Button
            variant="secondary"
            label={t('bodyAddon.food.scanAgain')}
            onPress={() => {
              setResult(null);
              setCode(null);
            }}
          />
        </Card>
      )}
      {lookup.isPending ? (
        <ListState kind="loading" label={t('bodyAddon.food.lookingUp', { code })} />
      ) : null}
      <Text variant="caption" tone="secondary">
        {t('bodyAddon.food.scanHint')}
      </Text>
      <OffAttribution />
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { height: 320, borderRadius: 16, overflow: 'hidden' },
  card: { gap: spacing.sm },
});

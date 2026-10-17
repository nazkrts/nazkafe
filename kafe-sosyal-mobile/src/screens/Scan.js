import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../api';
import { Btn, ErrorText, styles } from '../ui';
import { c } from '../theme';

// Kafe QR'ı şu biçimdedir: kafeapp://checkin?c=<kafe-id>&t=<token>
export function parseQr(data) {
  const m = /^kafeapp:\/\/checkin\?(.+)$/.exec(String(data).trim());
  if (!m) return null;
  const params = {};
  for (const part of m[1].split('&')) {
    const [k, v] = part.split('=');
    params[k] = decodeURIComponent(v || '');
  }
  return params.c && params.t ? { cafe_id: params.c, qr_token: params.t } : null;
}

export default function Scan({ navigation }) {
  const [perm, requestPerm] = useCameraPermissions();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  const onScan = async ({ data }) => {
    if (handled.current) return;
    handled.current = true;
    setErr('');
    const payload = parseQr(data);
    if (!payload) {
      setErr('Bu bir kafe QR kodu değil.');
      setTimeout(() => (handled.current = false), 1500);
      return;
    }
    setBusy(true);
    try {
      await api('POST', '/checkins/scan', payload);
      navigation.goBack();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
      setTimeout(() => (handled.current = false), 2000);
    }
  };

  if (!perm) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  if (!perm.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 28, gap: 16, justifyContent: 'center' }}>
        <Text style={styles.h2}>Kamera izni gerekli</Text>
        <Text style={styles.muted}>Yalnızca kafedeki QR kodunu okutmak için kullanılır. Konumun alınmaz.</Text>
        <Btn title="İzin ver" onPress={requestPerm} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : onScan} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 24, gap: 8, backgroundColor: 'rgba(20,32,29,0.85)' }}>
        <Text style={{ color: c.white, fontSize: 16, fontWeight: '700' }}>{busy ? 'Check-in yapılıyor…' : 'Kafedeki QR kodunu çerçeveye al'}</Text>
        <ErrorText>{err}</ErrorText>
      </View>
    </View>
  );
}

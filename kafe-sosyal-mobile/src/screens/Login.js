import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { publicApi, setTokens } from '../api';
import { Btn, ErrorText, Field, styles } from '../ui';
import { c } from '../theme';

const CONSENTS = [
  { type: 'privacy_notice', label: 'Gizlilik bildirimini okudum' },
  { type: 'explicit_consent', label: 'Açık rıza metnini kabul ediyorum' },
  { type: 'community_rules', label: 'Topluluk kurallarını kabul ediyorum' },
];

export default function Login({ onDone }) {
  const [step, setStep] = useState('id'); // id | code | onboarding
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [ok, setOk] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setErr('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      await publicApi('POST', '/auth/otp/request', { identifier: identifier.trim() });
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      const r = await publicApi('POST', '/auth/otp/verify', { identifier: identifier.trim(), code: code.trim() });
      if (r.onboarding_required) {
        setToken(r.onboarding_token);
        setStep('onboarding');
      } else {
        await setTokens(r);
        onDone();
      }
    });

  const complete = () =>
    run(async () => {
      const r = await publicApi('POST', '/onboarding/complete', {
        onboarding_token: token,
        display_name: name.trim(),
        birth_date: birth.trim(),
        consents: CONSENTS.map((x) => ({ type: x.type, version: '1.0', granted: !!ok[x.type] })),
      });
      await setTokens(r);
      onDone();
    });

  const allOk = CONSENTS.every((x) => ok[x.type]);
  const birthOk = /^\d{4}-\d{2}-\d{2}$/.test(birth.trim());

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 28, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 20, fontWeight: '700', color: c.green, marginTop: 24 }}>Kafe Sosyal</Text>
          <Text style={[styles.h1, { marginTop: 24 }]}>Kafede yeni insanlarla tanış.</Text>
          <Text style={styles.muted}>Konum paylaşmadan, yalnızca bulunduğun kafedeki QR ile. Görünürlüğü sen açarsın.</Text>

          {step === 'id' && (
            <View style={{ gap: 14, marginTop: 8 }}>
              <Field label="Telefon veya e-posta" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" keyboardType="email-address" placeholder="0532 111 22 33" />
              <Btn title="Kod gönder" onPress={requestCode} disabled={busy || !identifier.trim()} />
            </View>
          )}

          {step === 'code' && (
            <View style={{ gap: 14, marginTop: 8 }}>
              <Field label="Doğrulama kodu" value={code} onChangeText={setCode} keyboardType="number-pad" textContentType="oneTimeCode" />
              <Text style={styles.muted}>Geliştirmede kod, sunucu logunda görünür.</Text>
              <Btn title="Doğrula" onPress={verify} disabled={busy || !code.trim()} />
              <Btn title="Numarayı değiştir" kind="outline" onPress={() => setStep('id')} />
            </View>
          )}

          {step === 'onboarding' && (
            <View style={{ gap: 14, marginTop: 8 }}>
              <Field label="Görünen ad" value={name} onChangeText={setName} maxLength={60} />
              <Field label="Doğum tarihi (YYYY-AA-GG, 18 yaş ve üzeri)" value={birth} onChangeText={setBirth} placeholder="1998-05-17" keyboardType="numbers-and-punctuation" />
              {CONSENTS.map((x) => (
                <View key={x.type} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 15, color: c.ink }}>{x.label}</Text>
                  <Switch accessibilityLabel={x.label} value={!!ok[x.type]} onValueChange={(v) => setOk({ ...ok, [x.type]: v })} trackColor={{ true: c.green }} />
                </View>
              ))}
              <Btn title="Kaydı tamamla" onPress={complete} disabled={busy || !name.trim() || !birthOk || !allOk} />
            </View>
          )}

          <ErrorText>{err}</ErrorText>
          <Text style={[styles.muted, { fontSize: 13 }]}>Uygulama yalnızca 18 yaş ve üzeri içindir.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

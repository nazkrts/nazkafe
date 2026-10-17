import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Switch, Text, View, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Btn, Card, ErrorText, styles } from '../ui';
import { c } from '../theme';

const INTENTS = [
  { slug: 'coffee', label: 'Kahve içmek' },
  { slug: 'meet', label: 'Yeni insanlarla tanışmak' },
  { slug: 'networking', label: 'Networking' },
  { slug: 'games', label: 'Oyun oynamak' },
  { slug: 'study', label: 'Ders/çalışma arkadaşı' },
  { slug: 'dating', label: 'Flört/tanışma' },
  { slug: 'friends', label: 'Arkadaş edinmek' },
];

export default function Cafes({ navigation }) {
  const [cafes, setCafes] = useState([]);
  const [checkin, setCheckin] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cl, cur] = await Promise.all([api('GET', '/cafes'), api('GET', '/checkins/current')]);
      setCafes(cl.cafes || []);
      setCheckin(cur.checkin);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const act = async (fn) => {
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

  const toggleIntent = (slug) =>
    act(async () => {
      const next = checkin.intents.includes(slug) ? checkin.intents.filter((s) => s !== slug) : [...checkin.intents, slug];
      if (next.length === 0) throw new Error('En az bir niyet seçmelisin.');
      await api('PUT', '/checkins/current/intents', { intents: next });
      await load();
    });

  const setVisible = (visible) =>
    act(async () => {
      await api('PUT', '/checkins/current/visibility', { visible });
      await load();
    });

  const end = () =>
    act(async () => {
      await api('POST', '/checkins/current/end');
      await load();
    });

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={{ padding: 20, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {checkin ? (
        <View style={{ backgroundColor: c.green, borderRadius: 20, padding: 18, gap: 14 }}>
          <Text style={{ color: c.white, opacity: 0.85, fontSize: 13 }}>Check-in aktif · en fazla 3 saat</Text>
          <Text style={{ color: c.white, fontSize: 22, fontWeight: '700' }}>{checkin.cafe.name}</Text>
          <Text style={{ color: c.white, opacity: 0.85, fontSize: 13 }}>Burada ne arıyorsun?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {INTENTS.map((i) => {
              const on = checkin.intents.includes(i.slug);
              return (
                <Pressable
                  key={i.slug}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleIntent(i.slug)}
                  disabled={busy}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: c.white, backgroundColor: on ? c.white : 'transparent', justifyContent: 'center' }}
                >
                  <Text style={{ color: on ? c.green : c.white, fontSize: 14, fontWeight: '500' }}>{i.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: 14, gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.white, fontWeight: '700', fontSize: 15 }}>Görünür ol</Text>
              <Text style={{ color: c.white, opacity: 0.85, fontSize: 12 }}>Kapalıyken kimse seni göremez.</Text>
            </View>
            <Switch accessibilityLabel="Görünür ol" value={checkin.visible} onValueChange={setVisible} disabled={busy} trackColor={{ true: c.amber }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="light" title="Keşfe geç" style={{ flex: 1 }} onPress={() => navigation.navigate('Keşif')} />
            <Btn kind="outline" title="Çıkış yap" style={{ borderColor: c.white }} onPress={end} disabled={busy} />
          </View>
        </View>
      ) : (
        <Btn title="Kafe QR'ını tara" onPress={() => navigation.navigate('Scan')} />
      )}

      <ErrorText>{err}</ErrorText>

      <Text style={{ fontSize: 13, fontWeight: '700', color: c.muted, marginTop: 8 }}>Yakındaki kafeler</Text>
      {cafes.length === 0 && !err && <Text style={styles.muted}>Henüz kafe yok. Backend'de npm run db:seed çalıştır.</Text>}
      {cafes.map((cf) => (
        <Card key={cf.id}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: c.ink }}>{cf.name}{cf.branch_name ? ` · ${cf.branch_name}` : ''}</Text>
          <Text style={styles.muted}>{[cf.district, cf.city].filter(Boolean).join(', ')}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

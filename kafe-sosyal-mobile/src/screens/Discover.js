import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Avatar, Btn, Card, ErrorText, styles } from '../ui';
import { c } from '../theme';

export default function Discover({ navigation }) {
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [matched, setMatched] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    try {
      setData(await api('GET', '/discover'));
      setIdx(0);
    } catch (e) {
      setData(null);
      setErr(e.status === 409 || e.code === 'NO_ACTIVE_CHECKIN' ? 'Keşif için önce bir kafede check-in yapmalısın.' : e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const people = data?.people || [];
  const p = people[idx];

  const decide = async (kind) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api('POST', `/discover/${p.user_id}/${kind}`);
      if (r.matched) setMatched({ id: r.match_id, name: p.display_name });
      else setIdx((i) => i + 1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 14 }}>
      <Text style={styles.muted}>Aynı kafedeki, görünür olan kişiler. Beğenin, karşılıklı olana kadar gizli kalır.</Text>
      <ErrorText>{err}</ErrorText>

      {matched && (
        <View style={{ backgroundColor: c.green, borderRadius: 20, padding: 24, gap: 12, alignItems: 'center' }}>
          <Text style={{ color: c.white, fontSize: 26, fontWeight: '700' }}>Eşleştiniz!</Text>
          <Text style={{ color: c.white, textAlign: 'center' }}>Siz de {matched.name} da birbirinizi beğendiniz.</Text>
          <Btn kind="light" title="Sohbete git" style={{ alignSelf: 'stretch' }} onPress={() => { const id = matched.id; setMatched(null); setIdx((i) => i + 1); navigation.navigate('Chat', { id }); }} />
          <Btn kind="outline" title="Keşfe devam et" style={{ borderColor: c.white, alignSelf: 'stretch' }} onPress={() => { setMatched(null); setIdx((i) => i + 1); }} />
        </View>
      )}

      {!matched && p && (
        <Card>
          <View style={{ height: 200, borderRadius: 14, backgroundColor: '#3F8F7B', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.white, fontSize: 84, fontWeight: '700' }}>{p.display_name[0]}</Text>
          </View>
          <Text style={{ fontSize: 26, fontWeight: '700', color: c.ink }}>{p.display_name}, {p.age}</Text>
          {p.photo_verified && (
            <Text style={{ alignSelf: 'flex-start', backgroundColor: c.tint, color: c.green, fontWeight: '700', fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }}>Fotoğraf doğrulandı</Text>
          )}
          {p.common_interests?.length > 0 && (
            <>
              <Text style={styles.muted}>Ortak ilgi alanları</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {p.common_interests.map((i, k) => (
                  <Text key={k} style={{ backgroundColor: c.bg, borderWidth: 1, borderColor: c.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, fontSize: 14, color: c.ink, overflow: 'hidden' }}>{i.label || i.slug || String(i)}</Text>
                ))}
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 6 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Geç" onPress={() => decide('pass')} disabled={busy} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, borderColor: '#B9C6C2', alignItems: 'center', justifyContent: 'center', backgroundColor: c.white }}>
              <Text style={{ fontSize: 28, color: c.muted }}>✕</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Beğen" onPress={() => decide('like')} disabled={busy} style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: c.green }}>
              <Text style={{ fontSize: 28, color: c.white }}>♥</Text>
            </Pressable>
          </View>
        </Card>
      )}

      {!matched && !p && !err && (
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
          <Text style={styles.h2}>Şimdilik bu kadar</Text>
          <Text style={styles.muted}>Bu kafede şu an gösterecek başka kimse yok.</Text>
          <Btn kind="outline" title="Yenile" onPress={load} />
        </View>
      )}
    </ScrollView>
  );
}

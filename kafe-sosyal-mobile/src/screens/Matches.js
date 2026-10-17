import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { Avatar, ErrorText, styles } from '../ui';
import { c } from '../theme';

export default function Matches({ navigation }) {
  const [list, setList] = useState([]);
  const [err, setErr] = useState('');

  useFocusEffect(
    useCallback(() => {
      api('GET', '/matches')
        .then((r) => {
          setList(r.matches || []);
          setErr('');
        })
        .catch((e) => setErr(e.message));
    }, []),
  );

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 12 }}>
      <ErrorText>{err}</ErrorText>
      {list.length === 0 && !err && <Text style={styles.muted}>Henüz eşleşmen yok.</Text>}
      {list.map((m) => (
        <Pressable key={m.match_id} accessibilityRole="button" onPress={() => navigation.navigate('Chat', { id: m.match_id })} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Avatar name={m.other.display_name} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: c.ink }}>{m.other.display_name}, {m.other.age}</Text>
            <Text style={styles.muted}>{m.cafe_name}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

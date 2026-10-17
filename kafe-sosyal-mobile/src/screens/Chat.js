import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { Btn, ErrorText, styles } from '../ui';
import { c } from '../theme';

export default function Chat({ route, navigation }) {
  const { id } = route.params;
  const [match, setMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [starters, setStarters] = useState([]);
  const [draft, setDraft] = useState('');
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const list = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const r = await api('GET', `/matches/${id}/messages`);
      setMessages([...r.messages].reverse());
      await api('POST', `/matches/${id}/messages/read`);
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    api('GET', `/matches/${id}`)
      .then((m) => {
        setMatch(m);
        navigation.setOptions({ title: `${m.other.display_name}, ${m.other.age}` });
      })
      .catch((e) => setErr(e.message));
    api('GET', `/matches/${id}/starters`).then((r) => setStarters(r.starters || [])).catch(() => {});
    loadMessages();
    const t = setInterval(loadMessages, 5000);
    return () => clearInterval(t);
  }, [id, loadMessages, navigation]);

  const send = async (body) => {
    if (!body.trim()) return;
    setErr('');
    try {
      const r = await api('POST', `/matches/${id}/messages`, { body });
      setWarn(r.warning ? r.warning.message : '');
      setDraft('');
      await loadMessages();
    } catch (e) {
      setErr(e.message);
    }
  };

  const endMatch = () =>
    Alert.alert('Eşleşmeyi bitir', 'Emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Bitir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api('POST', `/matches/${id}/end`);
            navigation.goBack();
          } catch (e) {
            setErr(e.message);
          }
        },
      },
    ]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          starters.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.muted}>Sohbeti başlatmak için bir öneri seç:</Text>
              {starters.map((s, i) => {
                const text = typeof s === 'string' ? s : s.text;
                return (
                  <Pressable key={i} accessibilityRole="button" onPress={() => send(text)} style={{ borderWidth: 1.5, borderColor: '#B9C6C2', backgroundColor: c.white, borderRadius: 14, padding: 12 }}>
                    <Text style={{ color: c.ink, fontSize: 15 }}>{text}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={{ alignSelf: item.mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: item.mine ? c.green : c.white, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Text style={{ color: item.mine ? c.white : c.ink, fontSize: 15, lineHeight: 21 }}>{item.body}</Text>
          </View>
        )}
      />
      <View style={{ paddingHorizontal: 16, gap: 6 }}>
        {warn ? <Text style={styles.error}>{warn}</Text> : null}
        <ErrorText>{err}</ErrorText>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center' }}>
        <TextInput accessibilityLabel="Mesaj" value={draft} onChangeText={setDraft} placeholder="Mesaj yaz" maxLength={1000} style={[styles.input, { flex: 1 }]} />
        <Btn title="Gönder" onPress={() => send(draft)} disabled={!draft.trim()} />
      </View>
      <Pressable accessibilityRole="button" onPress={endMatch} style={{ alignItems: 'center', padding: 10 }}>
        <Text style={{ color: c.red, fontWeight: '500' }}>Eşleşmeyi bitir</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

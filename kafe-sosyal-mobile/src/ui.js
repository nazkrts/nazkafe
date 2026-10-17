import React from 'react';
import { Pressable, Text, View, StyleSheet, TextInput } from 'react-native';
import { c } from './theme';

export function Btn({ title, onPress, kind = 'primary', disabled, style }) {
  const s = [styles.btn, kind === 'primary' && styles.primary, kind === 'outline' && styles.outline, kind === 'light' && styles.light, kind === 'danger' && styles.danger, disabled && { opacity: 0.5 }, style];
  const t = [styles.btnText, kind === 'outline' && { color: c.green }, kind === 'light' && { color: c.green }];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={s}>
      <Text style={t}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, ...props }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#8A9893" style={styles.input} {...props} />
    </View>
  );
}

export const Card = ({ children, style }) => <View style={[styles.card, style]}>{children}</View>;
export const ErrorText = ({ children }) => (children ? <Text accessibilityRole="alert" style={styles.error}>{children}</Text> : null);

export function Avatar({ name, size = 44 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#3F8F7B', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.white, fontWeight: '700', fontSize: size * 0.42 }}>{(name || '?')[0]}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: c.green },
  outline: { borderWidth: 1.5, borderColor: c.green, backgroundColor: 'transparent' },
  light: { backgroundColor: c.white },
  danger: { backgroundColor: c.red },
  btnText: { color: c.white, fontWeight: '700', fontSize: 16 },
  label: { fontSize: 14, fontWeight: '500', color: c.ink },
  input: { minHeight: 52, borderWidth: 1.5, borderColor: '#B9C6C2', borderRadius: 14, paddingHorizontal: 16, fontSize: 16, backgroundColor: c.white, color: c.ink },
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 18, padding: 16, gap: 10 },
  error: { color: c.red, fontSize: 14 },
  h1: { fontSize: 32, fontWeight: '700', color: c.ink, lineHeight: 36 },
  h2: { fontSize: 26, fontWeight: '700', color: c.ink },
  muted: { color: c.muted, fontSize: 14, lineHeight: 20 },
});

import React, { useState } from 'react';
import { publicApi, setTokens } from './api.js';

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
      await publicApi('POST', '/auth/otp/request', { identifier });
      setStep('code');
    });

  const verify = () =>
    run(async () => {
      const r = await publicApi('POST', '/auth/otp/verify', { identifier, code });
      if (r.onboarding_required) {
        setToken(r.onboarding_token);
        setStep('onboarding');
      } else {
        setTokens(r);
        onDone();
      }
    });

  const complete = () =>
    run(async () => {
      const r = await publicApi('POST', '/onboarding/complete', {
        onboarding_token: token,
        display_name: name,
        birth_date: birth,
        consents: CONSENTS.map((c) => ({ type: c.type, version: '1.0', granted: !!ok[c.type] })),
      });
      setTokens(r);
      onDone();
    });

  const allOk = CONSENTS.every((c) => ok[c.type]);

  return (
    <div className="login">
      <span className="brand big">Kafe Sosyal</span>
      <h1>Kafede yeni insanlarla tanış.</h1>
      <p className="muted">Konum paylaşmadan, yalnızca bulunduğun kafedeki QR ile. Görünürlüğü sen açarsın.</p>

      {step === 'id' && (
        <form onSubmit={(e) => { e.preventDefault(); requestCode(); }}>
          <label htmlFor="id">Telefon veya e-posta</label>
          <input id="id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="0532 111 22 33" />
          <button className="primary" disabled={busy || !identifier.trim()}>Kod gönder</button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }}>
          <label htmlFor="code">Doğrulama kodu</label>
          <input id="code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
          <p className="muted small">Geliştirmede kod, sunucu logunda görünür.</p>
          <button className="primary" disabled={busy || !code.trim()}>Doğrula</button>
          <button type="button" className="link" onClick={() => setStep('id')}>Numarayı değiştir</button>
        </form>
      )}

      {step === 'onboarding' && (
        <form onSubmit={(e) => { e.preventDefault(); complete(); }}>
          <label htmlFor="name">Görünen ad</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <label htmlFor="birth">Doğum tarihi (18 yaş ve üzeri)</label>
          <input id="birth" type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
          {CONSENTS.map((c) => (
            <label key={c.type} className="check">
              <input type="checkbox" checked={!!ok[c.type]} onChange={(e) => setOk({ ...ok, [c.type]: e.target.checked })} />
              {c.label}
            </label>
          ))}
          <button className="primary" disabled={busy || !name.trim() || !birth || !allOk}>Kaydı tamamla</button>
        </form>
      )}

      {err && <p className="error" role="alert">{err}</p>}
      <p className="muted small">Uygulama yalnızca 18 yaş ve üzeri içindir.</p>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

const INTENTS = [
  { slug: 'coffee', label: 'Kahve içmek' },
  { slug: 'meet', label: 'Yeni insanlarla tanışmak' },
  { slug: 'networking', label: 'Networking' },
  { slug: 'games', label: 'Oyun oynamak' },
  { slug: 'study', label: 'Ders/çalışma arkadaşı' },
  { slug: 'dating', label: 'Flört/tanışma' },
  { slug: 'friends', label: 'Arkadaş edinmek' },
];

export default function Cafes({ onDiscover }) {
  const [cafes, setCafes] = useState([]);
  const [checkin, setCheckin] = useState(null);
  const [pick, setPick] = useState(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, cur] = await Promise.all([api('GET', '/cafes'), api('GET', '/checkins/current')]);
      setCafes(c.cafes || []);
      setCheckin(cur.checkin);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const scan = () =>
    act(async () => {
      await api('POST', '/checkins/scan', { cafe_id: pick.id, qr_token: qr.trim() });
      setQr('');
      setPick(null);
      await load();
    });

  const toggleIntent = (slug) =>
    act(async () => {
      const cur = checkin.intents.includes(slug) ? checkin.intents.filter((s) => s !== slug) : [...checkin.intents, slug];
      if (cur.length === 0) throw new Error('En az bir niyet seçmelisin.');
      await api('PUT', '/checkins/current/intents', { intents: cur });
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
    <section>
      <h2>Kafeler</h2>

      {checkin ? (
        <div className="card accent">
          <div className="row">
            <div>
              <div className="small">Check-in aktif</div>
              <strong className="big">{checkin.cafe.name}</strong>
            </div>
            <span className="pill">En fazla 3 saat</span>
          </div>

          <div className="small">Burada ne arıyorsun?</div>
          <div className="chips">
            {INTENTS.map((i) => (
              <button
                key={i.slug}
                className={checkin.intents.includes(i.slug) ? 'chip on' : 'chip'}
                aria-pressed={checkin.intents.includes(i.slug)}
                onClick={() => toggleIntent(i.slug)}
                disabled={busy}
              >
                {i.label}
              </button>
            ))}
          </div>

          <label className="check light">
            <input type="checkbox" checked={checkin.visible} onChange={(e) => setVisible(e.target.checked)} disabled={busy} />
            Görünür ol (kapalıyken kimse seni göremez)
          </label>

          <div className="row">
            <button className="light-btn" onClick={onDiscover}>Keşfe geç</button>
            <button className="outline-light" onClick={end} disabled={busy}>Çıkış yap</button>
          </div>
        </div>
      ) : pick ? (
        <div className="card">
          <strong>{pick.name}</strong>
          <label htmlFor="qr">Kafedeki QR kodunun değeri</label>
          <input id="qr" value={qr} onChange={(e) => setQr(e.target.value)} placeholder="QR token'ı yapıştır" />
          <p className="muted small">Geliştirmede token için backend klasöründe <code>npm run qr -- {pick.id}</code> çalıştır.</p>
          <div className="row">
            <button className="primary" onClick={scan} disabled={busy || qr.trim().length < 10}>Check-in yap</button>
            <button className="link" onClick={() => setPick(null)}>Vazgeç</button>
          </div>
        </div>
      ) : (
        <p className="muted">Bulunduğun kafeyi seçip QR ile check-in yap.</p>
      )}

      {err && <p className="error" role="alert">{err}</p>}

      <h3>Yakındaki kafeler</h3>
      {cafes.length === 0 && <p className="muted">Henüz kafe yok. Backend'de <code>npm run db:seed</code> çalıştır.</p>}
      {cafes.map((c) => (
        <div className="card row" key={c.id}>
          <div>
            <strong>{c.name}{c.branch_name ? ` · ${c.branch_name}` : ''}</strong>
            <div className="small muted">{[c.district, c.city].filter(Boolean).join(', ')}</div>
          </div>
          {!checkin && <button className="outline" onClick={() => setPick(c)}>Seç</button>}
        </div>
      ))}
    </section>
  );
}

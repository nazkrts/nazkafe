import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

export default function Discover({ onMatch }) {
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
      setErr(e.code === 'NO_ACTIVE_CHECKIN' || e.status === 409 ? 'Keşif için önce bir kafede check-in yapmalısın.' : e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    <section>
      <h2>Keşif</h2>
      <p className="muted small">Aynı kafedeki, görünür olan kişiler. Beğenin, karşılıklı olana kadar gizli kalır.</p>
      {err && <p className="error" role="alert">{err}</p>}

      {matched && (
        <div className="card accent center">
          <strong className="big">Eşleştiniz!</strong>
          <p>Siz de {matched.name} da birbirinizi beğendiniz.</p>
          <button className="light-btn" onClick={() => onMatch(matched.id)}>Sohbete git</button>
          <button className="outline-light" onClick={() => { setMatched(null); setIdx((i) => i + 1); }}>Keşfe devam et</button>
        </div>
      )}

      {!matched && p && (
        <div className="card person">
          <div className="avatar">{p.display_name[0]}</div>
          <strong className="big">{p.display_name}, {p.age}</strong>
          {p.photo_verified && <span className="pill ok">Fotoğraf doğrulandı</span>}
          {p.common_interests?.length > 0 && (
            <>
              <div className="small muted">Ortak ilgi alanları</div>
              <div className="chips">
                {p.common_interests.map((i) => (
                  <span className="chip static" key={i.slug || i.label || i}>{i.label || i.slug || String(i)}</span>
                ))}
              </div>
            </>
          )}
          <div className="row center">
            <button className="round" aria-label="Geç" onClick={() => decide('pass')} disabled={busy}>✕</button>
            <button className="round primary" aria-label="Beğen" onClick={() => decide('like')} disabled={busy}>♥</button>
          </div>
        </div>
      )}

      {!matched && !p && !err && (
        <div className="center">
          <strong className="big">Şimdilik bu kadar</strong>
          <p className="muted">Bu kafede şu an gösterecek başka kimse yok.</p>
          <button className="outline" onClick={load}>Yenile</button>
        </div>
      )}
    </section>
  );
}

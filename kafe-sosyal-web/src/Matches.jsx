import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

function Chat({ id, onBack }) {
  const [match, setMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [starters, setStarters] = useState([]);
  const [draft, setDraft] = useState('');
  const [warn, setWarn] = useState('');
  const [err, setErr] = useState('');
  const end = useRef(null);

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
    api('GET', `/matches/${id}`).then(setMatch).catch((e) => setErr(e.message));
    api('GET', `/matches/${id}/starters`).then((r) => setStarters(r.starters || [])).catch(() => {});
    loadMessages();
    const t = setInterval(loadMessages, 5000);
    return () => clearInterval(t);
  }, [id, loadMessages]);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

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

  const endMatch = async () => {
    if (!window.confirm('Eşleşmeyi bitirmek istediğine emin misin?')) return;
    try {
      await api('POST', `/matches/${id}/end`);
      onBack();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <section className="chat">
      <div className="row">
        <button className="link" onClick={onBack}>← Eşleşmeler</button>
        <button className="link danger" onClick={endMatch}>Eşleşmeyi bitir</button>
      </div>
      <h2>{match ? `${match.other.display_name}, ${match.other.age}` : '…'}</h2>
      <div className="msgs">
        {messages.map((m) => (
          <div key={m.id} className={m.mine ? 'msg mine' : 'msg'}>{m.body}</div>
        ))}
        <div ref={end} />
      </div>
      {warn && <p className="error">{warn}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {messages.length === 0 && starters.length > 0 && (
        <div className="chips">
          {starters.map((s, i) => (
            <button key={i} className="chip" onClick={() => send(typeof s === 'string' ? s : s.text)}>
              {typeof s === 'string' ? s : s.text}
            </button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <label className="sr" htmlFor="msg">Mesaj</label>
        <input id="msg" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Mesaj yaz" maxLength={1000} />
        <button className="primary" disabled={!draft.trim()}>Gönder</button>
      </form>
    </section>
  );
}

export default function Matches({ openId, setOpenId }) {
  const [list, setList] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (openId) return;
    api('GET', '/matches').then((r) => setList(r.matches || [])).catch((e) => setErr(e.message));
  }, [openId]);

  if (openId) return <Chat id={openId} onBack={() => setOpenId(null)} />;

  return (
    <section>
      <h2>Eşleşmeler</h2>
      {err && <p className="error" role="alert">{err}</p>}
      {list.length === 0 && !err && <p className="muted">Henüz eşleşmen yok.</p>}
      {list.map((m) => (
        <button className="card row left" key={m.match_id} onClick={() => setOpenId(m.match_id)}>
          <div className="avatar small-av">{m.other.display_name[0]}</div>
          <div>
            <strong>{m.other.display_name}, {m.other.age}</strong>
            <div className="small muted">{m.cafe_name}</div>
          </div>
        </button>
      ))}
    </section>
  );
}

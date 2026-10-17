import React, { useEffect, useState } from 'react';
import { hasSession, setLogoutHandler, setTokens, api } from './api.js';
import Login from './Login.jsx';
import Cafes from './Cafes.jsx';
import Discover from './Discover.jsx';
import Matches from './Matches.jsx';

const TABS = [
  { id: 'cafes', label: 'Kafeler' },
  { id: 'discover', label: 'Keşif' },
  { id: 'matches', label: 'Eşleşmeler' },
];

export default function App() {
  const [authed, setAuthed] = useState(hasSession());
  const [tab, setTab] = useState('cafes');
  const [openMatch, setOpenMatch] = useState(null);

  useEffect(() => {
    setLogoutHandler(() => setAuthed(false));
  }, []);

  const logout = async () => {
    try {
      const raw = JSON.parse(localStorage.getItem('kafe_tokens') || 'null');
      if (raw) await api('POST', '/auth/logout', { refresh_token: raw.refresh_token });
    } catch {
      /* oturum zaten kapanmış olabilir */
    }
    setTokens(null);
    setAuthed(false);
  };

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const goMatch = (id) => {
    setOpenMatch(id);
    setTab('matches');
  };

  return (
    <div className="shell">
      <header className="top">
        <span className="brand">Kafe Sosyal</span>
        <button className="link" onClick={logout}>Çıkış</button>
      </header>
      <main className="main">
        {tab === 'cafes' && <Cafes onDiscover={() => setTab('discover')} />}
        {tab === 'discover' && <Discover onMatch={goMatch} />}
        {tab === 'matches' && <Matches openId={openMatch} setOpenId={setOpenMatch} />}
      </main>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { apiGet, apiPost, getToken, login, setToken } from './api';

type View = 'dashboard' | 'users' | 'subscriptions' | 'devices' | 'payments' | 'nodes' | 'traffic' | 'audit';

const NAV: Array<{ id: View; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'users', label: 'Пользователи' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'devices', label: 'Устройства' },
  { id: 'payments', label: 'Платежи' },
  { id: 'nodes', label: 'Серверы' },
  { id: 'traffic', label: 'Трафик' },
  { id: 'audit', label: 'Audit log' },
];

export function App(): React.ReactElement {
  const [authed, setAuthed] = useState<boolean>(!!getToken());
  const [view, setView] = useState<View>('dashboard');
  const [userId, setUserId] = useState<string | null>(null);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div style={S.shell}>
      <aside style={S.sidebar}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Ghost Pepe</div>
        {NAV.map((n) => (
          <button key={n.id} style={{ ...S.navBtn, ...(view === n.id ? S.navActive : {}) }} onClick={() => { setView(n.id); setUserId(null); }}>
            {n.label}
          </button>
        ))}
        <button style={{ ...S.navBtn, marginTop: 'auto', color: '#f87171' }} onClick={() => { setToken(null); setAuthed(false); }}>Выйти</button>
      </aside>
      <main style={S.main}>
        {userId ? <UserDetail id={userId} onBack={() => setUserId(null)} /> : <Views view={view} onOpenUser={setUserId} />}
      </main>
    </div>
  );
}

function Views({ view, onOpenUser }: { view: View; onOpenUser: (id: string) => void }): React.ReactElement {
  switch (view) {
    case 'dashboard': return <Dashboard />;
    case 'users': return <Users onOpenUser={onOpenUser} />;
    case 'nodes': return <Nodes />;
    case 'payments': return <Table title="Платежи" path="/admin/payments" cols={['user', 'plan', 'stars', 'currency', 'status', 'paidAt']} />;
    case 'subscriptions': return <Table title="Подписки" path="/admin/subscriptions" cols={['user', 'plan', 'status', 'expiresAt']} />;
    case 'devices': return <Table title="Устройства" path="/admin/devices" cols={['user', 'name', 'platform', 'status']} />;
    case 'traffic': return <Traffic />;
    case 'audit': return <Table title="Audit log" path="/admin/audit-log" cols={['at', 'actorType', 'action', 'entityType', 'entityId']} />;
    default: return <div />;
  }
}

function Login({ onLogin }: { onLogin: () => void }): React.ReactElement {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  return (
    <div style={{ ...S.center }}>
      <div style={{ ...S.card, width: 320 }}>
        <h2>Вход администратора</h2>
        <input style={S.input} placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={S.input} type="password" placeholder="пароль" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <div style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}
        <button style={S.primary} onClick={async () => { try { await login(email, password); onLogin(); } catch { setErr('Неверные данные'); } }}>Войти</button>
      </div>
    </div>
  );
}

function Dashboard(): React.ReactElement {
  const [d, setD] = useState<any>(null);
  useEffect(() => { apiGet('/admin/dashboard').then(setD).catch(() => undefined); }, []);
  if (!d) return <Loading />;
  return (
    <div>
      <h1>Dashboard</h1>
      <div style={S.grid}>
        <Stat label="Активные подписки" value={d.activeSubscriptions} />
        <Stat label="Истекают (3 дня)" value={d.expiringSubscriptions} />
        <Stat label="Активные устройства" value={d.activeDevices} />
        <Stat label="Выручка, ⭐" value={d.revenueStars} />
      </div>
      <h2>Серверы</h2>
      <table style={S.table}><thead><tr>{['code', 'country', 'role', 'online', 'xray', 'hysteria', 'cpu', 'ram', 'disk'].map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>{d.nodes.map((n: any) => (
          <tr key={n.code}><td style={S.td}>{n.code}</td><td style={S.td}>{n.country}</td><td style={S.td}>{n.role}</td>
            <td style={S.td}>{n.online ? '🟢' : '🔴'}</td><td style={S.td}>{n.xrayAlive ? '✓' : '✗'}</td><td style={S.td}>{n.hysteriaAlive ? '✓' : '✗'}</td>
            <td style={S.td}>{n.cpu}%</td><td style={S.td}>{n.ram}%</td><td style={S.td}>{n.disk}%</td></tr>
        ))}</tbody>
      </table>
      <h2>Трафик за 24ч</h2>
      <table style={S.table}><thead><tr><th style={S.th}>protocol</th><th style={S.th}>mode</th><th style={S.th}>bytes</th></tr></thead>
        <tbody>{d.traffic24h.map((t: any, i: number) => <tr key={i}><td style={S.td}>{t.protocol}</td><td style={S.td}>{t.mode}</td><td style={S.td}>{fmtBytes(t.bytes)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Users({ onOpenUser }: { onOpenUser: (id: string) => void }): React.ReactElement {
  const [data, setData] = useState<any>(null);
  useEffect(() => { apiGet('/admin/users').then(setData).catch(() => undefined); }, []);
  if (!data) return <Loading />;
  return (
    <div>
      <h1>Пользователи ({data.total})</h1>
      <table style={S.table}><thead><tr>{['telegramId', 'username', 'status', 'createdAt'].map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>{data.users.map((u: any) => (
          <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => onOpenUser(u.id)}>
            <td style={S.td}>{u.telegramId}</td><td style={S.td}>{u.username ?? '—'}</td><td style={S.td}>{u.status}</td><td style={S.td}>{fmtDate(u.createdAt)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function UserDetail({ id, onBack }: { id: string; onBack: () => void }): React.ReactElement {
  const [u, setU] = useState<any>(null);
  const reload = () => apiGet(`/admin/users/${id}`).then(setU).catch(() => undefined);
  useEffect(() => { reload(); }, [id]);
  if (!u) return <Loading />;
  return (
    <div>
      <button style={S.ghost} onClick={onBack}>← Назад</button>
      <h1>{u.username ?? u.telegramId}</h1>
      <div style={{ marginBottom: 12 }}>
        <span style={S.badge}>{u.status}</span>{' '}
        {u.status === 'blocked'
          ? <button style={S.ghost} onClick={async () => { await apiPost(`/admin/users/${id}/unblock`); reload(); }}>Разблокировать</button>
          : <button style={S.danger} onClick={async () => { await apiPost(`/admin/users/${id}/block`); reload(); }}>Заблокировать</button>}
      </div>
      <h2>Подписки</h2>
      {u.subscriptions.map((s: any) => (
        <div key={s.id} style={S.card}>
          {s.plan} • {s.status} • до {fmtDate(s.expiresAt)} • {fmtBytes(s.trafficUsedBytes)} / {Number(s.trafficLimitBytes) > 0 ? fmtBytes(s.trafficLimitBytes) : '∞'}
          <button style={{ ...S.ghost, marginLeft: 10 }} onClick={async () => { await apiPost(`/admin/subscriptions/${s.id}/extend`, { days: 30 }); reload(); }}>+30 дней</button>
        </div>
      ))}
      <h2>Устройства</h2>
      {u.devices.map((d: any) => (
        <div key={d.id} style={S.card}>
          {d.name} • {d.platform} • {d.status}
          {d.status === 'active' && <button style={{ ...S.danger, marginLeft: 10 }} onClick={async () => { await apiPost(`/admin/devices/${d.id}/disable`); reload(); }}>Отключить</button>}
        </div>
      ))}
      <h2>Платежи</h2>
      {u.payments.map((p: any) => <div key={p.id} style={S.card}>{p.plan} • {p.stars}⭐ • {p.status} • {p.paidAt ? fmtDate(p.paidAt) : '—'}</div>)}
      <h2>Трафик</h2>
      {u.traffic.map((t: any, i: number) => <div key={i} style={S.card}>{t.protocol}/{t.mode}: {fmtBytes(t.total)}</div>)}
    </div>
  );
}

function Nodes(): React.ReactElement {
  const [nodes, setNodes] = useState<any[] | null>(null);
  useEffect(() => { apiGet('/admin/nodes').then(setNodes as any).catch(() => undefined); }, []);
  if (!nodes) return <Loading />;
  return (
    <div>
      <h1>Серверы</h1>
      {nodes.map((n) => (
        <div key={n.id} style={S.card}>
          <b>{n.code}</b> • {n.country} • {n.role} • профилей: {n.profiles}<br />
          VLESS: {n.vlessDomain} | Hysteria: {n.hysteriaDomain}<br />
          {n.metric ? `xray:${n.metric.xrayAlive ? '✓' : '✗'} hysteria:${n.metric.hysteriaAlive ? '✓' : '✗'} cpu:${n.metric.cpu}% ram:${n.metric.ram}% disk:${n.metric.disk}% • ${fmtDate(n.metric.lastHeartbeat)}` : 'нет heartbeat'}
        </div>
      ))}
    </div>
  );
}

function Traffic(): React.ReactElement {
  const [t, setT] = useState<any>(null);
  useEffect(() => { apiGet('/admin/traffic?days=7').then(setT).catch(() => undefined); }, []);
  if (!t) return <Loading />;
  return (
    <div>
      <h1>Трафик (7 дней)</h1>
      <h2>По серверам</h2>
      {t.byNode.map((b: any, i: number) => <div key={i} style={S.card}>{b.node}: {fmtBytes(b.bytes)}</div>)}
      <h2>По протоколу/режиму</h2>
      {t.byProtocolMode.map((b: any, i: number) => <div key={i} style={S.card}>{b.protocol}/{b.mode}: {fmtBytes(b.bytes)}</div>)}
    </div>
  );
}

function Table({ title, path, cols }: { title: string; path: string; cols: string[] }): React.ReactElement {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { apiGet(path).then((d: any) => setRows(Array.isArray(d) ? d : d.users ?? [])).catch(() => undefined); }, [path]);
  if (!rows) return <Loading />;
  return (
    <div>
      <h1>{title}</h1>
      <table style={S.table}><thead><tr>{cols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} style={S.td}>{format(c, r[c])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function format(col: string, v: any): string {
  if (v == null) return '—';
  if (col.toLowerCase().includes('at')) return fmtDate(v);
  return String(v);
}

const Stat = ({ label, value }: { label: string; value: any }) => (
  <div style={S.card}><div style={{ color: '#8b97a6', fontSize: 13 }}>{label}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div></div>
);
const Loading = () => <div style={{ padding: 40, color: '#8b97a6' }}>Загрузка…</div>;

function fmtDate(iso: string): string { return iso ? new Date(iso).toLocaleString('ru-RU') : '—'; }
function fmtBytes(n: any): string {
  n = Number(n); if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2) + ' ' + u[i];
}

const S: Record<string, React.CSSProperties> = {
  shell: { display: 'flex', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0e1116', color: '#e7edf3' },
  sidebar: { width: 200, background: '#171b22', borderRight: '1px solid #252b34', display: 'flex', flexDirection: 'column', padding: 16, gap: 4, minHeight: '100vh' },
  main: { flex: 1, padding: '24px 32px', overflow: 'auto' },
  navBtn: { textAlign: 'left', background: 'transparent', border: 0, color: '#c4cdd8', padding: '9px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 14 },
  navActive: { background: '#252b34', color: '#fff' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0e1116', fontFamily: 'system-ui' },
  card: { background: '#171b22', border: '1px solid #252b34', borderRadius: 12, padding: 14, marginBottom: 10 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 },
  input: { display: 'block', width: '100%', margin: '8px 0', padding: 10, background: '#0e1116', border: '1px solid #252b34', borderRadius: 8, color: '#e7edf3' },
  primary: { width: '100%', padding: 11, background: '#34d399', color: '#04231a', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  ghost: { background: 'transparent', color: '#e7edf3', border: '1px solid #252b34', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' },
  danger: { background: 'transparent', color: '#f87171', border: '1px solid #5b2a2a', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' },
  badge: { background: '#252b34', borderRadius: 999, padding: '3px 10px', fontSize: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #252b34', color: '#8b97a6', fontWeight: 600 },
  td: { padding: '8px 10px', borderBottom: '1px solid #1c2128' },
};

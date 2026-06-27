import { getConfig } from '@ghostpepe/config';

/**
 * Subscription import page (docs 03, 06 §12). Single, fast, dependency-free
 * HTML page. Device detection happens client-side for UX; the backend
 * re-validates the platform on import/start (real protection).
 */
export function renderImportPage(publicToken: string): string {
  const cfg = getConfig();
  const apiBase = cfg.API_BASE_URL.replace(/\/$/, '');
  const serviceName = cfg.HAPP_SUBSCRIPTION_NAME;
  const supportUrl = cfg.HAPP_SUPPORT_URL;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${escapeHtml(serviceName)} — Подключение</title>
<style>
  :root { color-scheme: light dark; --bg:#0e1116; --card:#171b22; --fg:#e7edf3; --muted:#8b97a6; --accent:#34d399; --danger:#f87171; --border:#252b34; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--fg); }
  .wrap { max-width:480px; margin:0 auto; padding:24px 18px 48px; }
  h1 { font-size:22px; margin:8px 0 2px; }
  .sub { color:var(--muted); font-size:14px; margin-bottom:20px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:18px; margin-bottom:16px; }
  .row { display:flex; justify-content:space-between; padding:6px 0; font-size:15px; }
  .row .k { color:var(--muted); } .row .v { font-weight:600; }
  .badge { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; font-weight:600; }
  .ok { background:rgba(52,211,153,.15); color:var(--accent); }
  .bad { background:rgba(248,113,113,.15); color:var(--danger); }
  button { width:100%; padding:15px; border:0; border-radius:12px; font-size:16px; font-weight:600; margin-top:10px; cursor:pointer; }
  .primary { background:var(--accent); color:#04231a; }
  .ghost { background:transparent; color:var(--fg); border:1px solid var(--border); }
  button:disabled { opacity:.4; cursor:not-allowed; }
  .hint { font-size:12px; color:var(--muted); text-align:center; margin-top:6px; }
  #msg { text-align:center; font-size:14px; margin-top:14px; min-height:20px; }
  a { color:var(--accent); }
  #qr { text-align:center; margin-top:14px; }
  #qr img { background:#fff; padding:8px; border-radius:12px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(serviceName)}</h1>
  <div class="sub">Импорт подписки в Happ</div>

  <div class="card" id="status-card">
    <div class="row"><span class="k">Статус</span><span class="v" id="status">…</span></div>
    <div class="row"><span class="k">Действует до</span><span class="v" id="expires">…</span></div>
    <div class="row"><span class="k">Трафик</span><span class="v" id="traffic">…</span></div>
    <div class="row"><span class="k">Устройства</span><span class="v" id="devices">…</span></div>
  </div>

  <div class="card">
    <button class="primary" id="btn-ios">Открыть в Happ на iPhone</button>
    <button class="primary" id="btn-android">Открыть в Happ на Android</button>
    <button class="primary" id="btn-desktop">Открыть в Happ на Windows/macOS</button>
    <div class="hint" id="platform-hint"></div>
    <button class="ghost" id="btn-qr">Показать QR-код</button>
    <button class="ghost" id="btn-copy">Скопировать ссылку подписки</button>
    <div id="qr"></div>
    <div id="msg"></div>
  </div>

  <div class="hint">Нужна помощь? <a href="${escapeHtml(supportUrl)}">Поддержка</a></div>
</div>

<script>
  var TOKEN = ${JSON.stringify(publicToken)};
  var API = ${JSON.stringify(apiBase)};

  function detectPlatform() {
    var ua = navigator.userAgent.toLowerCase();
    var isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    if (/iphone|ipad|ipod/.test(ua) || isTouchMac) return 'ios';
    if (/android/.test(ua)) return 'android';
    if (/windows|macintosh|mac os x|linux/.test(ua)) return 'desktop';
    return 'unknown';
  }

  function genInstallId() {
    var k = 'gp_install_id';
    var v = localStorage.getItem(k);
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()); localStorage.setItem(k, v); }
    return v;
  }

  function fmtBytes(n) {
    n = Number(n); if (!n) return '0 B';
    var u = ['B','KB','MB','GB','TB']; var i = Math.min(u.length-1, Math.floor(Math.log(n)/Math.log(1024)));
    return (n/Math.pow(1024,i)).toFixed(i===0?0:2)+' '+u[i];
  }

  var plat = detectPlatform();
  var btnIos = document.getElementById('btn-ios');
  var btnAnd = document.getElementById('btn-android');
  var btnDesk = document.getElementById('btn-desktop');
  var hint = document.getElementById('platform-hint');

  // Enable only the matching platform button; the others stay disabled.
  function applyPlatform() {
    btnIos.disabled = plat !== 'ios';
    btnAnd.disabled = plat !== 'android';
    btnDesk.disabled = plat !== 'desktop';
    if (plat === 'ios') hint.textContent = 'Определено: iPhone / iPad';
    else if (plat === 'android') hint.textContent = 'Определено: Android';
    else if (plat === 'desktop') hint.textContent = 'Определено: компьютер';
    else { hint.textContent = 'Не удалось определить устройство — выберите вручную.'; btnIos.disabled = btnAnd.disabled = btnDesk.disabled = false; }
  }
  applyPlatform();

  async function loadStatus() {
    try {
      var r = await fetch(API + '/api/import/' + encodeURIComponent(TOKEN));
      if (!r.ok) { document.getElementById('status').textContent = 'ссылка недействительна'; return; }
      var d = await r.json();
      document.getElementById('status').innerHTML = d.access
        ? '<span class="badge ok">' + d.status + '</span>'
        : '<span class="badge bad">' + (d.accessReason || d.status) + '</span>';
      document.getElementById('expires').textContent = new Date(d.expiresAt).toLocaleDateString('ru-RU');
      document.getElementById('traffic').textContent = Number(d.trafficLimitBytes) > 0
        ? fmtBytes(d.trafficUsedBytes) + ' / ' + fmtBytes(d.trafficLimitBytes)
        : fmtBytes(d.trafficUsedBytes) + ' (безлимит)';
      document.getElementById('devices').textContent = d.deviceCount + ' из ' + d.deviceLimit;
    } catch (e) { document.getElementById('status').textContent = 'ошибка загрузки'; }
  }

  var lastBodyUrl = null;

  async function startImport(platform) {
    var msg = document.getElementById('msg');
    msg.textContent = 'Готовим подписку…';
    try {
      var r = await fetch(API + '/api/subscription/import/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicToken: TOKEN, platform: platform === 'desktop' ? 'windows' : platform, installId: genInstallId() })
      });
      var d = await r.json();
      if (!r.ok) { msg.textContent = d.message || 'Ошибка импорта.'; return; }
      lastBodyUrl = d.subscriptionBodyUrl;
      msg.innerHTML = 'Открываем Happ…';
      // Try deeplink, then fallback.
      window.location.href = d.happImportUrl;
      setTimeout(function () {
        msg.innerHTML = 'Если Happ не открылся: <a href="https://www.happ.su/" target="_blank">установите Happ</a>, затем нажмите кнопку ещё раз. ' +
          'Или <a href="#" id="copy2">скопируйте ссылку</a>.';
        var c2 = document.getElementById('copy2'); if (c2) c2.onclick = function(e){ e.preventDefault(); copyLink(); };
      }, 2500);
    } catch (e) { msg.textContent = 'Сеть недоступна. Повторите.'; }
  }

  function copyLink() {
    if (!lastBodyUrl) { document.getElementById('msg').textContent = 'Сначала нажмите кнопку импорта.'; return; }
    navigator.clipboard.writeText(lastBodyUrl).then(function(){ document.getElementById('msg').textContent = 'Ссылка скопирована.'; });
  }

  btnIos.onclick = function(){ startImport('ios'); };
  btnAnd.onclick = function(){ startImport('android'); };
  btnDesk.onclick = function(){ startImport('desktop'); };
  document.getElementById('btn-copy').onclick = copyLink;
  document.getElementById('btn-qr').onclick = function(){
    if (!lastBodyUrl) { startImport(plat === 'unknown' ? 'desktop' : plat).then(showQr); setTimeout(showQr, 1200); }
    else showQr();
  };
  function showQr(){
    if (!lastBodyUrl) return;
    var url = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(lastBodyUrl);
    document.getElementById('qr').innerHTML = '<img src="' + url + '" alt="QR" />';
  }

  loadStatus();
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

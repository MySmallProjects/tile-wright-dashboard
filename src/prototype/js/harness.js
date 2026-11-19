import '../components/tw-clock-tile.js';

const STORAGE_KEY = 'tw_proto_mock_session_v1';

const el = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  userList: document.getElementById('userList'),
  logoutBtn: document.getElementById('logoutBtn'),
  passwordRow: document.getElementById('passwordRow'),
  passwordInput: document.getElementById('passwordInput'),
  submitPwBtn: document.getElementById('submitPwBtn'),
  simHttpsChk: document.getElementById('simHttpsChk'),
  sessionBox: document.getElementById('sessionBox'),
  hubDot: document.getElementById('hubDot'),
  hubStatus: document.getElementById('hubStatus'),
  connectHubBtn: document.getElementById('connectHubBtn'),
  disconnectHubBtn: document.getElementById('disconnectHubBtn'),
  pushPayloadInput: document.getElementById('pushPayloadInput'),
  sendPushBtn: document.getElementById('sendPushBtn'),
  hubLog: document.getElementById('hubLog'),
  tileModeSelect: document.getElementById('tileModeSelect'),
  hourFormatSelect: document.getElementById('hourFormatSelect'),
  dateFormatInput: document.getElementById('dateFormatInput'),
  showSecondsChk: document.getElementById('showSecondsChk'),
  needsSetupChk: document.getElementById('needsSetupChk'),
  tileStage: document.getElementById('tileStage'),
  clockTile: document.getElementById('clockTile'),
  eventLog: document.getElementById('eventLog')
};

let theme = 'light';
let hubConnected = false;
let hubTimer = null;

function ts() {
  return new Date().toLocaleTimeString();
}

function appendLog(box, line) {
  box.textContent = `[${ts()}] ${line}\n` + box.textContent;
}

// --- 1. Mock Auth & Cookie Flow ---
function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
  renderSession();
}

function createMockToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function renderSession() {
  const s = loadSession();
  const isHttps = el.simHttpsChk.checked;
  if (!s) {
    el.sessionBox.textContent = 'Not signed in.\nClick a user above to test login and persistent session restore.';
    return;
  }
  const cookieName = isHttps ? '__Host-tw_session' : 'tw_session';
  const flags = isHttps
    ? 'Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=31536000'
    : 'Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000';

  el.sessionBox.textContent = [
    `Signed in as: ${s.displayName} (role: ${s.role})`,
    `Created:      ${s.createdAt}`,
    `Token hash:   sha256:${s.tokenPreview}... (opaque token stored in cookie only)`,
    `Set-Cookie:   ${cookieName}=<opaque>; ${flags}`
  ].join('\n');
}

el.userList.addEventListener('click', (e) => {
  const user = e.target?.dataset?.loginUser;
  if (!user) return;
  if (user === 'admin') {
    el.passwordRow.style.display = 'flex';
    el.passwordInput.value = '';
    el.passwordInput.focus();
  } else {
    el.passwordRow.style.display = 'none';
    saveSession({
      userId: 'tablet',
      displayName: 'Wall Tablet',
      role: 'user',
      createdAt: new Date().toISOString(),
      tokenPreview: createMockToken().slice(0, 12)
    });
  }
});

el.submitPwBtn.addEventListener('click', () => {
  if (el.passwordInput.value !== 'admin') {
    el.sessionBox.textContent = 'Invalid password (hint: use "admin").';
    return;
  }
  el.passwordRow.style.display = 'none';
  saveSession({
    userId: 'admin',
    displayName: 'Admin',
    role: 'admin',
    createdAt: new Date().toISOString(),
    tokenPreview: createMockToken().slice(0, 12)
  });
});

el.logoutBtn.addEventListener('click', () => {
  el.passwordRow.style.display = 'none';
  saveSession(null);
});

el.simHttpsChk.addEventListener('change', renderSession);

// --- 2. Mock SignalR Hub ---
function setHubState(connected) {
  hubConnected = connected;
  el.hubDot.classList.toggle('ok', connected);
  el.hubStatus.textContent = connected ? 'Connected (Mock Hub)' : 'Disconnected';

  if (hubTimer) {
    clearInterval(hubTimer);
    hubTimer = null;
  }

  if (connected) {
    appendLog(el.hubLog, 'Connected to /hubs/dashboard (mock). Version check: 0.1.0+1 OK.');
    hubTimer = setInterval(() => {
      const msg = `Heartbeat @ ${ts()}`;
      appendLog(el.hubLog, `← push: ${msg}`);
      el.clockTile.data = { serverNote: msg };
    }, 8000);
  } else {
    appendLog(el.hubLog, 'Disconnected from hub.');
  }
}

el.connectHubBtn.addEventListener('click', () => setHubState(true));
el.disconnectHubBtn.addEventListener('click', () => setHubState(false));
el.sendPushBtn.addEventListener('click', () => {
  if (!hubConnected) {
    appendLog(el.hubLog, 'Cannot push while disconnected — click Connect first.');
    return;
  }
  const text = el.pushPayloadInput.value.trim() || 'Manual push';
  appendLog(el.hubLog, `← push: ${text}`);
  el.clockTile.data = { serverNote: text };
});

// --- 3. Clock Web Component Contract ---
function syncTileProps() {
  const mode = el.tileModeSelect.value;
  el.tileStage.classList.toggle('is-edit', mode === 'edit');

  el.clockTile.settings = {
    hourFormat: el.hourFormatSelect.value,
    dateFormat: el.dateFormatInput.value,
    showSeconds: el.showSecondsChk.checked,
    needsSetup: el.needsSetupChk.checked
  };
  el.clockTile.context = {
    mode,
    theme,
    width: 2,
    height: 1,
    showDemoActions: true
  };
}

el.tileModeSelect.addEventListener('change', syncTileProps);
el.hourFormatSelect.addEventListener('change', syncTileProps);
el.dateFormatInput.addEventListener('input', syncTileProps);
el.showSecondsChk.addEventListener('change', syncTileProps);
el.needsSetupChk.addEventListener('change', syncTileProps);

el.clockTile.addEventListener('settings-changed', (e) => {
  appendLog(el.eventLog, `settings-changed: ${JSON.stringify(e.detail)}`);
  if (e.detail?.hourFormat) {
    el.hourFormatSelect.value = e.detail.hourFormat;
  }
});

el.clockTile.addEventListener('request-action', (e) => {
  appendLog(el.eventLog, `request-action: ${JSON.stringify(e.detail)}`);
});

// Theme toggle
el.themeToggleBtn.addEventListener('click', () => {
  theme = theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggleBtn.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
  syncTileProps();
});

// Boot
renderSession();
syncTileProps();
appendLog(el.hubLog, 'Ready. Click Connect to simulate SignalR push.');
appendLog(el.eventLog, 'Listening for Web Component events from <tw-clock-tile>...');

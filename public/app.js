/**
 * WhatsApp Message Scheduler - Client Application Logic
 */

// Application State
const state = {
  connection: {
    status: 'disconnected', // 'disconnected' | 'connecting' | 'scanning_qr' | 'connected'
    user: null,
    qrCodeDataUrl: null,
    qrGeneratedAt: null
  },
  messages: [],
  activeFilter: 'all',
  searchQuery: '',
  selectedPresetOffset: 5 // default +5 mins
};

// Quick Templates Library
const TEMPLATES = {
  meeting: "Hi! Just a friendly reminder about our upcoming meeting scheduled for today. Looking forward to our discussion! 📅",
  birthday: "Happy Birthday! 🎂 Wishing you a wonderful year ahead filled with joy, good health, and success! 🎉",
  followup: "Hi there! Just following up on our previous conversation. Please let me know if you had a chance to look into this. Thanks! 💼",
  checkin: "Hey! Just checking in to see how everything is going with you today. Hope you're having a productive week! 👋",
  urgent: "🚨 Urgent Alert: Please review the latest update as soon as possible and let me know your thoughts."
};

// DOM Elements
const elements = {
  liveClock: document.getElementById('live-clock-time'),
  connectionStatusPill: document.getElementById('connection-status-pill'),
  connectionStatusText: document.getElementById('connection-status-text'),
  btnDeviceModal: document.getElementById('btn-device-modal'),
  deviceBtnLabel: document.getElementById('device-btn-label'),
  
  // Metrics
  valMetricTotal: document.getElementById('val-metric-total'),
  valMetricPending: document.getElementById('val-metric-pending'),
  valMetricSent: document.getElementById('val-metric-sent'),
  valMetricFailed: document.getElementById('val-metric-failed'),
  
  // Tab counts
  countAll: document.getElementById('count-all'),
  countPending: document.getElementById('count-pending'),
  countSent: document.getElementById('count-sent'),
  countFailed: document.getElementById('count-failed'),

  // Form
  scheduleForm: document.getElementById('schedule-form'),
  inputRecipient: document.getElementById('input-recipient'),
  inputRecipientName: document.getElementById('input-recipient-name'),
  inputMessage: document.getElementById('input-message'),
  charCounter: document.getElementById('char-counter'),
  inputScheduleDatetime: document.getElementById('input-schedule-datetime'),
  inputRepeat: document.getElementById('input-repeat'),
  btnSendTest: document.getElementById('btn-send-test'),
  templateChipsContainer: document.getElementById('template-chips-container'),
  timePresetsGroup: document.getElementById('time-presets-group'),

  // Queue
  messagesList: document.getElementById('messages-list'),
  queueEmptyState: document.getElementById('queue-empty-state'),
  searchInput: document.getElementById('search-input'),
  filterTabs: document.getElementById('filter-tabs'),

  // Device Modal
  deviceModal: document.getElementById('device-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  viewConnected: document.getElementById('view-connected'),
  viewPairing: document.getElementById('view-pairing'),
  connectedUserName: document.getElementById('connected-user-name'),
  connectedUserPhone: document.getElementById('connected-user-phone'),
  qrContainer: document.querySelector('.qr-container'),
  qrImage: document.getElementById('qr-code-image'),
  qrLoadingSpinner: document.getElementById('qr-loading-spinner'),
  btnReconnect: document.getElementById('btn-reconnect'),
  btnLogout: document.getElementById('btn-logout'),

  // Pairing Code Tab
  tabQr: document.getElementById('tab-qr'),
  tabCode: document.getElementById('tab-code'),
  contentQr: document.getElementById('content-qr'),
  contentCode: document.getElementById('content-code'),
  inputPairingPhone: document.getElementById('input-pairing-phone'),
  btnRequestCode: document.getElementById('btn-request-code'),
  pairingCodeDisplay: document.getElementById('pairing-code-display'),
  pairingCodeValue: document.getElementById('pairing-code-value'),

  // Edit Modal
  editModal: document.getElementById('edit-modal'),
  btnCloseEditModal: document.getElementById('btn-close-edit-modal'),
  btnCancelEdit: document.getElementById('btn-cancel-edit'),
  editMessageForm: document.getElementById('edit-message-form'),
  editMessageId: document.getElementById('edit-message-id'),
  editRecipient: document.getElementById('edit-recipient'),
  editRecipientName: document.getElementById('edit-recipient-name'),
  editMessage: document.getElementById('edit-message'),
  editScheduleDatetime: document.getElementById('edit-schedule-datetime'),
  editRepeat: document.getElementById('edit-repeat'),

  toastContainer: document.getElementById('toast-container')
};

// Format Date to YYYY-MM-DDTHH:mm for datetime-local input
function formatToLocalDateTimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

// Set Default Scheduled Date (+5 mins)
function setDefaultScheduleDate(minutesOffset = 5) {
  const d = new Date(Date.now() + minutesOffset * 60 * 1000);
  elements.inputScheduleDatetime.value = formatToLocalDateTimeInput(d);
  elements.inputScheduleDatetime.min = formatToLocalDateTimeInput(new Date());
}

// Live Clock Updater
function updateLiveClock() {
  const now = new Date();
  elements.liveClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// Toast Notification Helper
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-closing');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]);
}

// Render Connection Status
function renderConnectionStatus() {
  const { status, user, qrCodeDataUrl } = state.connection;
  const pill = elements.connectionStatusPill;
  const text = elements.connectionStatusText;
  const label = elements.deviceBtnLabel;

  pill.className = `status-pill status-${status}`;

  if (status === 'connected') {
    text.textContent = user ? `${user.name} (${user.phone})` : 'Connected';
    label.textContent = 'Account Linked';
    elements.viewConnected.classList.remove('hidden');
    elements.viewPairing.classList.add('hidden');
    if (user) {
      elements.connectedUserName.textContent = user.name || 'WhatsApp Account';
      elements.connectedUserPhone.textContent = user.phone || 'Connected';
    }
  } else if (status === 'scanning_qr') {
    text.textContent = 'Waiting for QR Scan';
    label.textContent = 'Scan QR Code';
    elements.viewConnected.classList.add('hidden');
    elements.viewPairing.classList.remove('hidden');
    if (qrCodeDataUrl) {
      elements.qrImage.src = qrCodeDataUrl;
      elements.qrImage.classList.remove('hidden');
      elements.qrLoadingSpinner.classList.add('hidden');
    }
  } else if (status === 'connecting') {
    text.textContent = 'Connecting...';
    label.textContent = 'Connecting';
    elements.viewConnected.classList.add('hidden');
    elements.viewPairing.classList.remove('hidden');
    elements.qrImage.classList.add('hidden');
    elements.qrLoadingSpinner.classList.remove('hidden');
  } else {
    text.textContent = 'Disconnected';
    label.textContent = 'Link Device';
    elements.viewConnected.classList.add('hidden');
    elements.viewPairing.classList.remove('hidden');
  }
}

// Fetch Initial Status & Messages
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.connection = data;
    renderConnectionStatus();
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

async function fetchMessages() {
  try {
    const res = await fetch('/api/messages');
    const data = await res.json();
    state.messages = data;
    renderMessages();
    renderMetrics();
  } catch (err) {
    console.error('Failed to fetch messages:', err);
  }
}

// Connect to Server-Sent Events (SSE)
function setupSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('status', (e) => {
    try {
      const data = JSON.parse(e.data);
      const prevStatus = state.connection.status;
      state.connection = data;
      renderConnectionStatus();

      if (prevStatus !== 'connected' && data.status === 'connected') {
        showToast(`WhatsApp connected as ${data.user?.phone || 'account'}!`, 'success');
      }
    } catch (err) {
      console.error('SSE status error:', err);
    }
  });

  eventSource.addEventListener('qr', (e) => {
    try {
      const data = JSON.parse(e.data);
      state.connection.qrCodeDataUrl = data.qrCodeDataUrl;
      if (elements.qrImage) {
        elements.qrImage.src = data.qrCodeDataUrl;
        elements.qrImage.classList.remove('hidden');
        elements.qrLoadingSpinner.classList.add('hidden');
      }
    } catch (err) {
      console.error('SSE QR error:', err);
    }
  });

  eventSource.addEventListener('schedule_created', (e) => {
    try {
      const item = JSON.parse(e.data);
      const idx = state.messages.findIndex(m => m.id === item.id);
      if (idx === -1) {
        state.messages.push(item);
      } else {
        state.messages[idx] = item;
      }
      renderMessages();
      renderMetrics();
    } catch (err) {
      console.error('SSE create error:', err);
    }
  });

  eventSource.addEventListener('schedule_updated', (e) => {
    try {
      const item = JSON.parse(e.data);
      const idx = state.messages.findIndex(m => m.id === item.id);
      if (idx !== -1) {
        state.messages[idx] = item;
      } else {
        state.messages.push(item);
      }
      renderMessages();
      renderMetrics();

      if (item.status === 'sent') {
        showToast(`Delivered message to ${item.recipientName || item.recipient}!`, 'success');
      } else if (item.status === 'failed') {
        showToast(`Failed to deliver message to ${item.recipient}: ${item.error || 'Error'}`, 'error');
      }
    } catch (err) {
      console.error('SSE update error:', err);
    }
  });

  eventSource.addEventListener('schedule_deleted', (e) => {
    try {
      const { id } = JSON.parse(e.data);
      state.messages = state.messages.filter(m => m.id !== id);
      renderMessages();
      renderMetrics();
    } catch (err) {
      console.error('SSE delete error:', err);
    }
  });

  eventSource.onerror = () => {
    console.warn('SSE connection disconnected. Reconnecting in 5s...');
  };
}

// Render Metrics & Counts
function renderMetrics() {
  const total = state.messages.length;
  const pending = state.messages.filter(m => m.status === 'pending' || m.status === 'sending').length;
  const sent = state.messages.filter(m => m.status === 'sent').length;
  const failed = state.messages.filter(m => m.status === 'failed').length;

  elements.valMetricTotal.textContent = total;
  elements.valMetricPending.textContent = pending;
  elements.valMetricSent.textContent = sent;
  elements.valMetricFailed.textContent = failed;

  elements.countAll.textContent = total;
  elements.countPending.textContent = pending;
  elements.countSent.textContent = sent;
  elements.countFailed.textContent = failed;
}

// Calculate countdown string
function getCountdownText(targetIso, status) {
  if (status === 'sent') return 'Delivered';
  if (status === 'failed') return 'Failed';
  if (status === 'sending') return 'Sending now...';

  const diffMs = new Date(targetIso).getTime() - Date.now();
  if (diffMs <= 0) return 'Due for dispatch...';

  const seconds = Math.floor((diffMs / 1000) % 60);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days > 0) return `In ${days}d ${hours}h`;
  if (hours > 0) return `In ${hours}h ${minutes}m`;
  if (minutes > 0) return `In ${minutes}m ${seconds}s`;
  return `In ${seconds}s`;
}

// Render Scheduled Messages List
function renderMessages() {
  let list = [...state.messages];

  // Filter tab
  if (state.activeFilter === 'pending') {
    list = list.filter(m => m.status === 'pending' || m.status === 'sending');
  } else if (state.activeFilter === 'sent') {
    list = list.filter(m => m.status === 'sent');
  } else if (state.activeFilter === 'failed') {
    list = list.filter(m => m.status === 'failed');
  }

  // Search query
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(m => 
      (m.recipient && m.recipient.toLowerCase().includes(q)) ||
      (m.recipientName && m.recipientName.toLowerCase().includes(q)) ||
      (m.message && m.message.toLowerCase().includes(q))
    );
  }

  // Sort by scheduledAt
  list.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

  if (list.length === 0) {
    elements.queueEmptyState.classList.remove('hidden');
    elements.messagesList.innerHTML = '';
    return;
  }

  elements.queueEmptyState.classList.add('hidden');
  elements.messagesList.innerHTML = list.map(item => createMessageCardHtml(item)).join('');
}

// Generate Message Card HTML
function createMessageCardHtml(item) {
  const initial = item.recipientName ? item.recipientName.charAt(0).toUpperCase() : '📞';
  const scheduledDate = new Date(item.scheduledAt);
  const formattedDate = scheduledDate.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const countdown = getCountdownText(item.scheduledAt, item.status);

  let statusBadgeClass = 'badge-pending';
  let statusText = 'Pending';
  if (item.status === 'sent') {
    statusBadgeClass = 'badge-sent';
    statusText = 'Sent';
  } else if (item.status === 'failed') {
    statusBadgeClass = 'badge-failed';
    statusText = 'Failed';
  } else if (item.status === 'sending') {
    statusBadgeClass = 'badge-sending';
    statusText = 'Sending';
  }

  const repeatTag = item.repeat && item.repeat !== 'none' 
    ? `<span class="repeat-badge">🔁 ${escapeHtml(item.repeat)}</span>` 
    : '';

  const sendNowBtn = item.status === 'pending' || item.status === 'failed'
    ? `<button class="action-btn action-btn-send" onclick="sendNow('${item.id}')" title="Send immediately">⚡ Send Now</button>`
    : '';

  const editBtn = item.status === 'pending'
    ? `<button class="action-btn" onclick="openEditModal('${item.id}')" title="Edit message or time">✏️ Edit</button>`
    : '';

  const retryBtn = item.status === 'failed'
    ? `<button class="action-btn action-btn-send" onclick="retryMessage('${item.id}')" title="Retry sending">🔄 Retry</button>`
    : '';

  return `
    <div class="message-card status-${item.status}" id="msg-card-${item.id}">
      <div class="msg-card-top">
        <div class="recipient-info">
          <div class="recipient-avatar">${initial}</div>
          <div class="recipient-text">
            <span class="recipient-name">${escapeHtml(item.recipientName || item.recipient)}</span>
            <span class="recipient-phone">${escapeHtml(item.recipient)}</span>
          </div>
        </div>

        <div class="msg-badge ${statusBadgeClass}">
          <span>${statusText}</span>
        </div>
      </div>

      <div class="msg-content-preview">${escapeHtml(item.message)}</div>

      ${item.error ? `<div class="field-hint" style="color: #f87171;">⚠️ ${escapeHtml(item.error)}</div>` : ''}

      <div class="msg-card-meta">
        <div class="timing-info">
          <span>📅 ${formattedDate}</span>
          <span class="countdown-tag" id="countdown-${item.id}">${countdown}</span>
          ${repeatTag}
        </div>

        <div class="card-actions-row">
          ${sendNowBtn}
          ${retryBtn}
          ${editBtn}
          <button class="action-btn action-btn-delete" onclick="deleteMessage('${item.id}')" title="Cancel or remove message">🗑️ Delete</button>
        </div>
      </div>
    </div>
  `;
}

// Tick loop to update countdown labels in real-time
setInterval(() => {
  for (const item of state.messages) {
    const el = document.getElementById(`countdown-${item.id}`);
    if (el) {
      el.textContent = getCountdownText(item.scheduledAt, item.status);
    }
  }
}, 1000);

// Actions: Send Now
window.sendNow = async function(id) {
  try {
    const res = await fetch(`/api/messages/${id}/send-now`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Dispatching message right now...', 'info');
    } else {
      showToast(data.error || 'Failed to dispatch message', 'error');
    }
  } catch (err) {
    showToast('Network error while dispatching message', 'error');
  }
};

// Actions: Retry
window.retryMessage = async function(id) {
  try {
    const res = await fetch(`/api/messages/${id}/retry`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast('Message queued for retry!', 'info');
    } else {
      showToast(data.error || 'Failed to retry', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
};

// Actions: Delete
window.deleteMessage = async function(id) {
  if (!confirm('Are you sure you want to cancel and remove this scheduled message?')) return;
  try {
    const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Scheduled message removed', 'info');
    } else {
      showToast('Failed to remove message', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
};

// Actions: Edit Modal
window.openEditModal = function(id) {
  const item = state.messages.find(m => m.id === id);
  if (!item) return;

  elements.editMessageId.value = item.id;
  elements.editRecipient.value = item.recipient;
  elements.editRecipientName.value = item.recipientName || '';
  elements.editMessage.value = item.message;
  elements.editScheduleDatetime.value = formatToLocalDateTimeInput(new Date(item.scheduledAt));
  elements.editRepeat.value = item.repeat || 'none';

  elements.editModal.classList.remove('hidden');
};

function closeEditModal() {
  elements.editModal.classList.add('hidden');
}

elements.btnCloseEditModal.addEventListener('click', closeEditModal);
elements.btnCancelEdit.addEventListener('click', closeEditModal);

elements.editMessageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = elements.editMessageId.value;
  const payload = {
    recipient: elements.editRecipient.value.trim(),
    recipientName: elements.editRecipientName.value.trim(),
    message: elements.editMessage.value.trim(),
    scheduledAt: new Date(elements.editScheduleDatetime.value).toISOString(),
    repeat: elements.editRepeat.value
  };

  try {
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('Scheduled message updated!', 'success');
      closeEditModal();
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to update message', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
});

// Event Listeners: Templates Chips
elements.templateChipsContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('.chip-btn');
  if (!btn) return;
  const templateKey = btn.dataset.template;
  if (TEMPLATES[templateKey]) {
    elements.inputMessage.value = TEMPLATES[templateKey];
    updateCharCounter();
    elements.inputMessage.focus();
    showToast(`Template applied: ${btn.textContent}`, 'info', 2000);
  }
});

// Event Listeners: Emojis & Formatting
document.querySelectorAll('.emoji-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    insertTextAtCursor(elements.inputMessage, emoji);
    updateCharCounter();
  });
});

document.querySelectorAll('.syntax-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const wrap = btn.dataset.wrap;
    wrapSelection(elements.inputMessage, wrap);
    updateCharCounter();
  });
});

function insertTextAtCursor(input, text) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const val = input.value;
  input.value = val.substring(0, start) + text + val.substring(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  input.focus();
}

function wrapSelection(input, wrapper) {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const val = input.value;
  const selected = val.substring(start, end);
  const replacement = `${wrapper}${selected || 'text'}${wrapper}`;
  input.value = val.substring(0, start) + replacement + val.substring(end);
  input.selectionStart = start + wrapper.length;
  input.selectionEnd = start + wrapper.length + (selected ? selected.length : 4);
  input.focus();
}

// Character Counter
function updateCharCounter() {
  const len = elements.inputMessage.value.length;
  elements.charCounter.textContent = `${len} char${len === 1 ? '' : 's'}`;
}
elements.inputMessage.addEventListener('input', updateCharCounter);

// Time Preset Buttons
elements.timePresetsGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.preset-time-btn');
  if (!btn) return;

  document.querySelectorAll('.preset-time-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const offset = btn.dataset.offset;
  const now = new Date();

  if (offset.startsWith('tomorrow-')) {
    const targetHour = parseInt(offset.replace('tomorrow-', ''), 10);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(targetHour, 0, 0, 0);
    elements.inputScheduleDatetime.value = formatToLocalDateTimeInput(tomorrow);
  } else {
    const minutes = parseInt(offset, 10);
    setDefaultScheduleDate(minutes);
  }
});

// Form Submit: Schedule Message
elements.scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleScheduleSubmit(false);
});

// Button: Send Test Immediately
elements.btnSendTest.addEventListener('click', async () => {
  if (!elements.inputRecipient.value.trim() || !elements.inputMessage.value.trim()) {
    showToast('Please enter both recipient phone and message text to send', 'error');
    elements.inputRecipient.focus();
    return;
  }
  await handleScheduleSubmit(true);
});

async function handleScheduleSubmit(sendImmediately) {
  const recipient = elements.inputRecipient.value.trim();
  const recipientName = elements.inputRecipientName.value.trim();
  const message = elements.inputMessage.value.trim();
  const scheduledAt = sendImmediately 
    ? new Date().toISOString() 
    : new Date(elements.inputScheduleDatetime.value).toISOString();
  const repeat = elements.inputRepeat.value;

  if (!recipient) {
    showToast('Recipient phone number is required', 'error');
    return;
  }
  if (!message) {
    showToast('Message content cannot be empty', 'error');
    return;
  }

  const payload = {
    recipient,
    recipientName,
    message,
    scheduledAt,
    repeat,
    sendImmediately
  };

  try {
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to schedule message', 'error');
      return;
    }

    if (sendImmediately) {
      showToast('Dispatching test message right now...', 'success');
    } else {
      showToast('Message successfully scheduled!', 'success');
    }

    // Reset form fields
    elements.inputMessage.value = '';
    updateCharCounter();
    setDefaultScheduleDate(5);

  } catch (err) {
    showToast('Network error while scheduling message', 'error');
  }
}

// Search & Filter Toolbar
elements.filterTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter-tab');
  if (!tab) return;

  document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');

  state.activeFilter = tab.dataset.filter;
  renderMessages();
});

elements.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value.trim();
  renderMessages();
});

// Device Modal Handling
elements.btnDeviceModal.addEventListener('click', () => {
  elements.deviceModal.classList.remove('hidden');
});

elements.btnCloseModal.addEventListener('click', () => {
  elements.deviceModal.classList.add('hidden');
});

// Close modal on click outside dialog
elements.deviceModal.addEventListener('click', (e) => {
  if (e.target === elements.deviceModal) {
    elements.deviceModal.classList.add('hidden');
  }
});

// Pairing Tabs (QR vs Code)
elements.tabQr.addEventListener('click', () => {
  elements.tabQr.classList.add('active');
  elements.tabCode.classList.remove('active');
  elements.contentQr.classList.remove('hidden');
  elements.contentCode.classList.add('hidden');
});

elements.tabCode.addEventListener('click', () => {
  elements.tabCode.classList.add('active');
  elements.tabQr.classList.remove('active');
  elements.contentCode.classList.remove('hidden');
  elements.contentQr.classList.add('hidden');
});

// Request 8-digit Pairing Code
elements.btnRequestCode.addEventListener('click', async () => {
  const phone = elements.inputPairingPhone.value.trim();
  if (!phone) {
    showToast('Please enter your phone number with country code', 'error');
    return;
  }

  elements.btnRequestCode.disabled = true;
  elements.btnRequestCode.textContent = 'Generating...';

  try {
    const res = await fetch('/api/request-pairing-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();

    if (res.ok && data.pairingCode) {
      elements.pairingCodeValue.textContent = data.pairingCode;
      elements.pairingCodeDisplay.classList.remove('hidden');
      showToast('Pairing code generated! Check WhatsApp on your phone.', 'success');
    } else {
      showToast(data.error || 'Failed to generate code', 'error');
    }
  } catch (err) {
    showToast('Failed to connect to server', 'error');
  } finally {
    elements.btnRequestCode.disabled = false;
    elements.btnRequestCode.textContent = 'Get Code';
  }
});

// Reconnect WhatsApp
elements.btnReconnect.addEventListener('click', async () => {
  try {
    showToast('Refreshing WhatsApp session...', 'info');
    await fetch('/api/reconnect', { method: 'POST' });
  } catch (err) {
    showToast('Error triggering reconnect', 'error');
  }
});

// Logout / Unlink Device
elements.btnLogout.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to unlink your WhatsApp account? You will need to scan QR code again.')) return;
  try {
    showToast('Unlinking account...', 'info');
    await fetch('/api/logout', { method: 'POST' });
    showToast('Disconnected from WhatsApp', 'info');
  } catch (err) {
    showToast('Error logging out', 'error');
  }
});

// Initialization
setDefaultScheduleDate(5);
fetchStatus();
fetchMessages();
setupSSE();

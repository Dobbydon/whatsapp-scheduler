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
  contacts: [],
  templates: [],
  selectedContact: null,
  focusedAutocompleteIdx: -1,
  activeFilter: 'all',
  searchQuery: '',
  selectedPresetOffset: 5, // default +5 mins
  soundEnabled: localStorage.getItem('wa_sound_enabled') !== 'false',
  notificationsEnabled: typeof Notification !== 'undefined' && Notification.permission === 'granted'
};

// DOM Elements Cache
const elements = {
  liveClock: document.getElementById('live-clock-time'),
  connectionStatusPill: document.getElementById('connection-status-pill'),
  connectionStatusText: document.getElementById('connection-status-text'),
  btnDeviceModal: document.getElementById('btn-device-modal'),
  deviceBtnLabel: document.getElementById('device-btn-label'),
  
  // Header Actions
  btnSoundToggle: document.getElementById('btn-sound-toggle'),
  soundIcon: document.getElementById('sound-icon'),
  btnNotifyToggle: document.getElementById('btn-notify-toggle'),
  notifyIcon: document.getElementById('notify-icon'),

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

  // Contact Picker Elements
  recentContactsPills: document.getElementById('recent-contacts-pills'),
  inputContactSearch: document.getElementById('input-contact-search'),
  contactSearchWrapper: document.getElementById('contact-search-wrapper'),
  contactAutocompleteDropdown: document.getElementById('contact-autocomplete-dropdown'),
  autocompleteList: document.getElementById('autocomplete-list'),
  selectedContactCard: document.getElementById('selected-contact-card'),
  selectedContactAvatar: document.getElementById('selected-contact-avatar'),
  selectedContactName: document.getElementById('selected-contact-name'),
  selectedContactPhone: document.getElementById('selected-contact-phone'),
  btnClearContact: document.getElementById('btn-clear-contact'),

  // Form & Composer
  composerCard: document.getElementById('composer-card'),
  scheduleForm: document.getElementById('schedule-form'),
  inputRecipient: document.getElementById('input-recipient'),
  inputRecipientName: document.getElementById('input-recipient-name'),
  inputMessage: document.getElementById('input-message'),
  inputMediaUrl: document.getElementById('input-media-url'),
  charCounter: document.getElementById('char-counter'),
  inputScheduleDatetime: document.getElementById('input-schedule-datetime'),
  inputRepeat: document.getElementById('input-repeat'),
  btnSendTest: document.getElementById('btn-send-test'),
  templateChipsContainer: document.getElementById('template-chips-container'),
  btnOpenTemplateModal: document.getElementById('btn-open-template-modal'),
  timePresetsGroup: document.getElementById('time-presets-group'),

  // Live WhatsApp Chat Preview
  chatPreviewBox: document.getElementById('chat-preview-box'),
  previewRecipientLabel: document.getElementById('preview-recipient-label'),
  previewBubbleText: document.getElementById('preview-bubble-text'),
  previewBubbleTime: document.getElementById('preview-bubble-time'),
  previewBubbleImageWrap: document.getElementById('preview-bubble-image-wrap'),
  previewBubbleImage: document.getElementById('preview-bubble-image'),

  // Queue & Toolbar
  messagesList: document.getElementById('messages-list'),
  queueEmptyState: document.getElementById('queue-empty-state'),
  searchInput: document.getElementById('search-input'),
  filterTabs: document.getElementById('filter-tabs'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnClearHistory: document.getElementById('btn-clear-history'),

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
  btnResetSession: document.getElementById('btn-reset-session'),

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

  // Template Modal
  templateModal: document.getElementById('template-modal'),
  btnCloseTemplateModal: document.getElementById('btn-close-template-modal'),
  btnCancelTemplate: document.getElementById('btn-cancel-template'),
  customTemplateForm: document.getElementById('custom-template-form'),
  templateTitleInput: document.getElementById('template-title'),
  templateContentInput: document.getElementById('template-content'),

  toastContainer: document.getElementById('toast-container')
};

// Synthesized Audio Chimes (Web Audio API - Zero dependencies)
const sound = {
  ctx: null,
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },
  playSent() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {}
  },
  playSchedule() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {}
  },
  playClick() {
    if (!state.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(850, now);
      gain.gain.setValueAtTime(0.03, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }
};

// Date Format Helpers
function formatToLocalDateTimeInput(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function setDefaultScheduleDate(minutesOffset = 5) {
  const d = new Date(Date.now() + minutesOffset * 60 * 1000);
  elements.inputScheduleDatetime.value = formatToLocalDateTimeInput(d);
  elements.inputScheduleDatetime.min = formatToLocalDateTimeInput(new Date());
  updateLivePreview();
}

// Live Clock Updater
function updateLiveClock() {
  const now = new Date();
  if (elements.liveClock) {
    elements.liveClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
setInterval(updateLiveClock, 1000);
updateLiveClock();

// Toast Notification Helper
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
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

// Markdown Preview Parser for Live WhatsApp Chat Bubble
function formatMarkdownPreview(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);
  // Code block ```code```
  escaped = escaped.replace(/```([\s\S]*?)```/g, '<code>$1</code>');
  // Bold *text*
  escaped = escaped.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
  // Italic _text_
  escaped = escaped.replace(/_([^_\\n]+)_/g, '<em>$1</em>');
  // Strike ~text~
  escaped = escaped.replace(/~([^~\n]+)~/g, '<del>$1</del>');
  return escaped;
}

// Live Preview Updater
function updateLivePreview() {
  if (!elements.previewBubbleText) return;

  const rawMsg = elements.inputMessage?.value.trim() || '';
  const contactName = state.selectedContact?.name || elements.inputRecipientName?.value.trim() || 'Recipient';

  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good morning';
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
  else if (hour >= 17) greeting = 'Good evening';

  let displayMsg = rawMsg || 'Type your message above to see real-time preview...';
  displayMsg = displayMsg
    .replace(/\{name\}/gi, contactName)
    .replace(/\{greeting\}/gi, greeting)
    .replace(/\{time\}/gi, elements.inputScheduleDatetime?.value ? new Date(elements.inputScheduleDatetime.value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    .replace(/\{date\}/gi, elements.inputScheduleDatetime?.value ? new Date(elements.inputScheduleDatetime.value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : now.toLocaleDateString([], { month: 'short', day: 'numeric' }));

  elements.previewBubbleText.innerHTML = formatMarkdownPreview(displayMsg);
  if (elements.previewRecipientLabel) {
    elements.previewRecipientLabel.textContent = `To: ${contactName}`;
  }

  // Time in bubble
  if (elements.previewBubbleTime) {
    if (elements.inputScheduleDatetime?.value) {
      try {
        const d = new Date(elements.inputScheduleDatetime.value);
        elements.previewBubbleTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (e) {
        elements.previewBubbleTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } else {
      elements.previewBubbleTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  // Image Media Preview
  const mediaUrl = elements.inputMediaUrl?.value.trim();
  if (mediaUrl && (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://'))) {
    elements.previewBubbleImageWrap?.classList.remove('hidden');
    if (elements.previewBubbleImage) elements.previewBubbleImage.src = mediaUrl;
  } else {
    elements.previewBubbleImageWrap?.classList.add('hidden');
    if (elements.previewBubbleImage) elements.previewBubbleImage.src = '';
  }
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

// Fetch Contacts from Server
async function fetchContacts(query = '') {
  try {
    const res = await fetch(`/api/contacts?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!query) {
      state.contacts = data;
      renderRecentContactChips(data);
    }
    return data;
  } catch (err) {
    console.error('Failed to fetch contacts:', err);
    return [];
  }
}

// Render Recent Contact Chips (1-click to select)
function renderRecentContactChips(contactsList) {
  if (!elements.recentContactsPills) return;
  elements.recentContactsPills.innerHTML = '';

  const recent = (contactsList || []).filter(c => c.name).slice(0, 8);
  const wrapper = document.getElementById('recent-contacts-wrapper');
  if (recent.length === 0) {
    if (wrapper) wrapper.classList.add('hidden');
    return;
  }
  if (wrapper) wrapper.classList.remove('hidden');

  recent.forEach(contact => {
    const initial = (contact.name || 'C').charAt(0).toUpperCase();
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'recent-contact-chip';
    chip.innerHTML = `
      <span class="chip-avatar">${escapeHtml(initial)}</span>
      <span>${escapeHtml(contact.name)}</span>
    `;
    chip.title = `${contact.name} (${contact.phone || contact.jid})`;
    chip.addEventListener('click', () => {
      sound.playClick();
      selectContact(contact);
    });
    elements.recentContactsPills.appendChild(chip);
  });
}

// Select a Contact
function selectContact(contact) {
  state.selectedContact = contact;
  const phone = contact.phone || contact.jid.split('@')[0];
  const name = contact.name || phone;

  elements.inputRecipient.value = phone;
  elements.inputRecipientName.value = name;

  // Update Selected Contact Card
  const initial = name.charAt(0).toUpperCase();
  elements.selectedContactAvatar.textContent = initial;
  elements.selectedContactName.textContent = name;
  elements.selectedContactPhone.textContent = phone;

  // Toggle Visibility
  elements.selectedContactCard.classList.remove('hidden');
  elements.contactSearchWrapper.classList.add('hidden');
  hideAutocomplete();

  updateLivePreview();
  elements.inputMessage.focus();
}

// Clear Selected Contact
function clearSelectedContact() {
  state.selectedContact = null;
  elements.inputRecipient.value = '';
  elements.inputRecipientName.value = '';

  elements.selectedContactCard.classList.add('hidden');
  elements.contactSearchWrapper.classList.remove('hidden');
  elements.inputContactSearch.value = '';
  elements.inputContactSearch.focus();
  updateLivePreview();
}

// Contact Autocomplete Search
let searchDebounceTimer = null;
elements.inputContactSearch?.addEventListener('input', () => {
  const query = elements.inputContactSearch.value.trim();
  clearTimeout(searchDebounceTimer);

  if (!query) {
    hideAutocomplete();
    return;
  }

  searchDebounceTimer = setTimeout(async () => {
    const matches = await fetchContacts(query);
    renderAutocompleteDropdown(matches, query);
  }, 120);
});

function renderAutocompleteDropdown(matches, query) {
  elements.autocompleteList.innerHTML = '';
  state.focusedAutocompleteIdx = -1;

  if (matches.length === 0) {
    const cleanNumbers = query.replace(/[^0-9]/g, '');
    if (cleanNumbers.length >= 7) {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      item.innerHTML = `
        <div class="autocomplete-item-left">
          <div class="autocomplete-avatar">📞</div>
          <div class="autocomplete-info">
            <span class="autocomplete-name">Use Phone: +${cleanNumbers}</span>
            <span class="autocomplete-phone">Click to select</span>
          </div>
        </div>
        <span class="autocomplete-badge">Direct Number</span>
      `;
      item.onclick = () => {
        sound.playClick();
        selectContact({
          name: `+${cleanNumbers}`,
          phone: `+${cleanNumbers}`,
          jid: `${cleanNumbers}@s.whatsapp.net`
        });
      };
      elements.autocompleteList.appendChild(item);
      elements.contactAutocompleteDropdown.classList.remove('hidden');
      return;
    }

    elements.autocompleteList.innerHTML = `
      <div style="padding: 0.85rem; text-align: center; font-size: 0.8rem; color: var(--text-muted);">
        No contacts found matching "${escapeHtml(query)}"
      </div>
    `;
    elements.contactAutocompleteDropdown.classList.remove('hidden');
    return;
  }

  matches.forEach((c, idx) => {
    const initial = (c.name || 'C').charAt(0).toUpperCase();
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.dataset.index = idx;

    item.innerHTML = `
      <div class="autocomplete-item-left">
        <div class="autocomplete-avatar">${escapeHtml(initial)}</div>
        <div class="autocomplete-info">
          <span class="autocomplete-name">${escapeHtml(c.name)}</span>
          <span class="autocomplete-phone">${escapeHtml(c.phone || c.jid)}</span>
        </div>
      </div>
      <span class="autocomplete-badge">${c.isGroup ? 'Group' : 'Contact'}</span>
    `;

    item.addEventListener('click', () => {
      sound.playClick();
      selectContact(c);
    });

    elements.autocompleteList.appendChild(item);
  });

  elements.contactAutocompleteDropdown.classList.remove('hidden');
}

function hideAutocomplete() {
  elements.contactAutocompleteDropdown?.classList.add('hidden');
  state.focusedAutocompleteIdx = -1;
}

// Keyboard Navigation for Autocomplete
elements.inputContactSearch?.addEventListener('keydown', (e) => {
  const items = elements.autocompleteList.querySelectorAll('.autocomplete-item');
  if (items.length === 0 || elements.contactAutocompleteDropdown.classList.contains('hidden')) {
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    state.focusedAutocompleteIdx = (state.focusedAutocompleteIdx + 1) % items.length;
    updateFocusedAutocompleteItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    state.focusedAutocompleteIdx = (state.focusedAutocompleteIdx - 1 + items.length) % items.length;
    updateFocusedAutocompleteItem(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (state.focusedAutocompleteIdx >= 0 && items[state.focusedAutocompleteIdx]) {
      items[state.focusedAutocompleteIdx].click();
    }
  } else if (e.key === 'Escape') {
    hideAutocomplete();
  }
});

function updateFocusedAutocompleteItem(items) {
  items.forEach((it, idx) => {
    if (idx === state.focusedAutocompleteIdx) {
      it.classList.add('is-focused');
      it.scrollIntoView({ block: 'nearest' });
    } else {
      it.classList.remove('is-focused');
    }
  });
}

// Click outside to close dropdown
document.addEventListener('click', (e) => {
  if (elements.contactSearchWrapper && !elements.contactSearchWrapper.contains(e.target)) {
    hideAutocomplete();
  }
});

elements.btnClearContact?.addEventListener('click', clearSelectedContact);

// Templates API Management
async function fetchTemplates() {
  try {
    const res = await fetch('/api/templates');
    const data = await res.json();
    state.templates = data;
    renderTemplateChips();
  } catch (err) {
    console.error('Failed to load templates:', err);
  }
}

function renderTemplateChips() {
  if (!elements.templateChipsContainer) return;
  elements.templateChipsContainer.innerHTML = '';

  const builtInIds = ['meeting', 'birthday', 'followup', 'checkin', 'urgent', 'standup'];

  state.templates.forEach(t => {
    const chip = document.createElement('div');
    chip.className = 'chip-btn';
    const isCustom = !builtInIds.includes(t.id);

    chip.innerHTML = `
      <span>${escapeHtml(t.title)}</span>
      ${isCustom ? `<button type="button" class="chip-delete-btn" title="Delete template" onclick="event.stopPropagation(); deleteCustomTemplate('${t.id}')">✕</button>` : ''}
    `;

    chip.addEventListener('click', () => {
      elements.inputMessage.value = t.content;
      updateCharCounter();
      updateLivePreview();
      sound.playClick();
      showToast(`Template applied: ${t.title}`, 'info', 2000);
      elements.inputMessage.focus();
    });

    elements.templateChipsContainer.appendChild(chip);
  });
}

window.deleteCustomTemplate = async function(id) {
  if (!confirm('Are you sure you want to delete this custom template?')) return;
  try {
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      sound.playClick();
      showToast('Template deleted', 'info');
      fetchTemplates();
    }
  } catch (err) {
    showToast('Failed to delete template', 'error');
  }
};

// Dynamic Variable Insertion Chips
document.querySelectorAll('.var-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tag = btn.dataset.var;
    if (!tag) return;
    insertTextAtCursor(elements.inputMessage, tag);
    updateCharCounter();
    updateLivePreview();
    sound.playClick();
  });
});

// Real-Time Connect via Server-Sent Events (SSE)
function setupSSE() {
  const eventSource = new EventSource('/api/events');

  eventSource.addEventListener('status', (e) => {
    try {
      const data = JSON.parse(e.data);
      const prevStatus = state.connection.status;
      state.connection = data;
      renderConnectionStatus();

      if (prevStatus !== 'connected' && data.status === 'connected') {
        sound.playSent();
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
        sound.playSent();
        showToast(`Delivered message to ${item.recipientName || item.recipient}!`, 'success');

        // Trigger native desktop notification if active
        if (state.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('WhatsApp Delivered ✓', {
            body: `Sent to ${item.recipientName || item.recipient}: "${item.message.slice(0, 45)}..."`,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2325D366"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
          });
        }
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

  eventSource.addEventListener('queue_reset', () => {
    fetchMessages();
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

// Countdown Calculation Helper
function getCountdownText(targetIso, status) {
  if (status === 'sent') return 'Delivered ✓';
  if (status === 'failed') return 'Failed ⚠️';
  if (status === 'sending') return '⚡ Sending...';

  const now = new Date().getTime();
  const target = new Date(targetIso).getTime();
  const diffSec = Math.floor((target - now) / 1000);

  if (diffSec <= 0) return '⚡ Due now';
  if (diffSec < 60) return `⏱ in ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `⏱ in ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `⏱ in ${diffHours}h ${diffMin % 60}m`;
  const diffDays = Math.floor(diffHours / 24);
  return `⏱ in ${diffDays}d ${diffHours % 24}h`;
}

// Render Scheduled Messages
function renderMessages() {
  let list = [...state.messages];

  // Filter Tab
  if (state.activeFilter !== 'all') {
    list = list.filter(m => {
      if (state.activeFilter === 'pending') return m.status === 'pending' || m.status === 'sending';
      return m.status === state.activeFilter;
    });
  }

  // Search Filter
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

  const mediaTag = item.mediaUrl 
    ? `<div class="field-hint" style="color: #60a5fa; margin-top: 0.25rem;">🖼️ Includes Photo Attachment</div>` 
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

  const duplicateBtn = `<button class="action-btn btn-action-duplicate" onclick="duplicateMessage('${item.id}')" title="Copy to composer to edit or re-schedule">📋 Duplicate</button>`;

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
      ${mediaTag}

      ${item.error ? `<div class="field-hint" style="color: #f87171;">⚠️ ${escapeHtml(item.error)}</div>` : ''}

      <div class="msg-card-meta">
        <div class="timing-info">
          <span>📅 ${formattedDate}</span>
          <span class="countdown-tag" id="countdown-${item.id}">${countdown}</span>
          ${repeatTag}
        </div>

        <div class="card-actions-row">
          ${duplicateBtn}
          ${sendNowBtn}
          ${retryBtn}
          ${editBtn}
          <button class="action-btn action-btn-delete" onclick="deleteMessage('${item.id}')" title="Cancel or remove message">🗑️ Delete</button>
        </div>
      </div>
    </div>
  `;
}

// Real-Time Countdown Ticker
setInterval(() => {
  for (const item of state.messages) {
    const el = document.getElementById(`countdown-${item.id}`);
    if (el) {
      el.textContent = getCountdownText(item.scheduledAt, item.status);
    }
  }
}, 1000);

// Action: Duplicate to Composer
window.duplicateMessage = function(id) {
  const item = state.messages.find(m => m.id === id);
  if (!item) return;

  elements.inputRecipient.value = item.recipient;
  elements.inputRecipientName.value = item.recipientName || '';
  elements.inputContactSearch.value = item.recipientName ? `${item.recipientName} (${item.recipient})` : item.recipient;
  elements.inputMessage.value = item.message;
  if (elements.inputMediaUrl) {
    elements.inputMediaUrl.value = item.mediaUrl || '';
  }

  updateCharCounter();
  updateLivePreview();

  // Highlight composer card with smooth scroll
  elements.composerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elements.composerCard.classList.remove('flash-composer');
  void elements.composerCard.offsetWidth; // trigger reflow
  elements.composerCard.classList.add('flash-composer');

  sound.playClick();
  showToast('Message loaded into composer! Ready to edit or re-schedule.', 'info');
};

// Actions: Send Now
window.sendNow = async function(id) {
  try {
    const res = await fetch(`/api/messages/${id}/send-now`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      sound.playClick();
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
      sound.playClick();
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
      sound.playClick();
      showToast('Scheduled message removed', 'info');
    } else {
      showToast('Failed to remove message', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
};

// Edit Modal Management
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

elements.editModal.addEventListener('click', (e) => {
  if (e.target === elements.editModal) closeEditModal();
});

elements.editMessageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = elements.editMessageId.value;
  const recipient = elements.editRecipient.value.trim();
  const recipientName = elements.editRecipientName.value.trim();
  const message = elements.editMessage.value.trim();
  const scheduledAt = new Date(elements.editScheduleDatetime.value).toISOString();
  const repeat = elements.editRepeat.value;

  try {
    const res = await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, recipientName, message, scheduledAt, repeat })
    });
    const data = await res.json();
    if (res.ok) {
      sound.playClick();
      showToast('Message updated successfully!', 'success');
      closeEditModal();
    } else {
      showToast(data.error || 'Failed to update message', 'error');
    }
  } catch (err) {
    showToast('Network error', 'error');
  }
});

// Custom Template Modal Management
elements.btnOpenTemplateModal?.addEventListener('click', () => {
  // Pre-fill template content with whatever is in composer if typed
  const curMsg = elements.inputMessage.value.trim();
  if (curMsg && elements.templateContentInput) {
    elements.templateContentInput.value = curMsg;
  }
  elements.templateModal.classList.remove('hidden');
  elements.templateTitleInput.focus();
});

function closeTemplateModal() {
  elements.templateModal.classList.add('hidden');
  elements.customTemplateForm.reset();
}

elements.btnCloseTemplateModal?.addEventListener('click', closeTemplateModal);
elements.btnCancelTemplate?.addEventListener('click', closeTemplateModal);

elements.templateModal?.addEventListener('click', (e) => {
  if (e.target === elements.templateModal) closeTemplateModal();
});

elements.customTemplateForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = elements.templateTitleInput.value.trim();
  const content = elements.templateContentInput.value.trim();
  if (!title || !content) return;

  try {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
    if (res.ok) {
      sound.playClick();
      showToast('Custom template saved!', 'success');
      closeTemplateModal();
      fetchTemplates();
    } else {
      showToast('Failed to save template', 'error');
    }
  } catch (err) {
    showToast('Network error saving template', 'error');
  }
});

// Event Listeners: Emojis & Formatting Toolbar
document.querySelectorAll('.emoji-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.emoji;
    insertTextAtCursor(elements.inputMessage, emoji);
    updateCharCounter();
    updateLivePreview();
  });
});

document.querySelectorAll('.syntax-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const wrap = btn.dataset.wrap;
    wrapSelection(elements.inputMessage, wrap);
    updateCharCounter();
    updateLivePreview();
  });
});

function insertTextAtCursor(input, text) {
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const val = input.value;
  input.value = val.substring(0, start) + text + val.substring(end);
  input.selectionStart = input.selectionEnd = start + text.length;
  input.focus();
}

function wrapSelection(input, wrapper) {
  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const val = input.value;
  const selected = val.substring(start, end);
  const replacement = `${wrapper}${selected || 'text'}${wrapper}`;
  input.value = val.substring(0, start) + replacement + val.substring(end);
  input.selectionStart = start + wrapper.length;
  input.selectionEnd = start + wrapper.length + (selected ? selected.length : 4);
  input.focus();
}

// Character Counter & Live Preview Listeners
function updateCharCounter() {
  const len = elements.inputMessage.value.length;
  elements.charCounter.textContent = `${len} char${len === 1 ? '' : 's'}`;
}

elements.inputMessage.addEventListener('input', () => {
  updateCharCounter();
  updateLivePreview();
});

elements.inputMediaUrl?.addEventListener('input', updateLivePreview);
elements.inputScheduleDatetime.addEventListener('change', updateLivePreview);

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

  sound.playClick();
  updateLivePreview();
});

// Form Submit: Schedule Message
elements.scheduleForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleScheduleSubmit(false);
});

// Button: Send Test Immediately
elements.btnSendTest.addEventListener('click', async () => {
  const query = elements.inputContactSearch?.value.trim() || '';
  if ((!elements.inputRecipient.value.trim() && !query) || !elements.inputMessage.value.trim()) {
    showToast('Please select a recipient contact and enter a message text', 'error');
    elements.inputContactSearch?.focus();
    return;
  }
  await handleScheduleSubmit(true);
});

async function handleScheduleSubmit(sendImmediately) {
  let recipient = elements.inputRecipient.value.trim();
  let recipientName = elements.inputRecipientName.value.trim();
  const mediaUrl = elements.inputMediaUrl?.value.trim() || null;

  // Support multiple comma-separated entries in search box or direct typed numbers
  if (!recipient && elements.inputContactSearch?.value.trim()) {
    const query = elements.inputContactSearch.value.trim();
    const exactMatch = state.contacts.find(c => (c.name || '').toLowerCase() === query.toLowerCase());
    if (exactMatch) {
      recipient = exactMatch.phone || exactMatch.jid;
      recipientName = exactMatch.name;
    } else {
      recipient = query;
    }
  }

  if (!recipient) {
    showToast('Please select a contact or enter a recipient phone number', 'error');
    elements.inputContactSearch?.focus();
    return;
  }
  if (!elements.inputMessage.value.trim()) {
    showToast('Message content cannot be empty', 'error');
    elements.inputMessage.focus();
    return;
  }

  const message = elements.inputMessage.value.trim();
  const scheduledAt = sendImmediately 
    ? new Date().toISOString() 
    : new Date(elements.inputScheduleDatetime.value).toISOString();
  const repeat = elements.inputRepeat.value;

  const payload = {
    recipient,
    recipientName,
    message,
    mediaUrl,
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
      sound.playSent();
      showToast('Dispatching message right now...', 'success');
    } else {
      sound.playSchedule();
      showToast('Message successfully scheduled!', 'success');
    }

    // Reset Form Fields
    elements.inputMessage.value = '';
    if (elements.inputMediaUrl) elements.inputMediaUrl.value = '';
    updateCharCounter();
    setDefaultScheduleDate(5);
    clearSelectedContact();
    fetchContacts();

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

// CSV Export
elements.btnExportCsv?.addEventListener('click', () => {
  sound.playClick();
  window.location.href = '/api/messages/export/csv';
  showToast('Exporting message logs to CSV...', 'info');
});

// Purge Sent & Failed Messages
elements.btnClearHistory?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to clear all delivered and failed messages from your queue? (Pending scheduled messages will be preserved)')) return;
  try {
    const res = await fetch('/api/messages/clear-sent', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      sound.playClick();
      showToast(`Cleaned up ${data.removedCount} past messages from queue!`, 'success');
      fetchMessages();
    } else {
      showToast('Failed to clear history', 'error');
    }
  } catch (err) {
    showToast('Network error clearing history', 'error');
  }
});

// Sound Toggle
elements.btnSoundToggle?.addEventListener('click', () => {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem('wa_sound_enabled', state.soundEnabled);
  elements.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
  elements.btnSoundToggle.title = state.soundEnabled ? 'Sound Chimes: Enabled' : 'Sound Chimes: Muted';
  if (state.soundEnabled) {
    elements.btnSoundToggle.classList.add('active');
    sound.playClick();
    showToast('Sound effects enabled 🔊', 'info');
  } else {
    elements.btnSoundToggle.classList.remove('active');
    showToast('Sound effects muted 🔇', 'info');
  }
});

// Desktop Notification Toggle
elements.btnNotifyToggle?.addEventListener('click', async () => {
  if (typeof Notification === 'undefined') {
    showToast('Desktop notifications are not supported in this browser', 'error');
    return;
  }
  if (Notification.permission === 'granted') {
    showToast('Desktop notifications are active! 🔔', 'info');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    state.notificationsEnabled = true;
    elements.btnNotifyToggle.classList.add('active');
    sound.playClick();
    showToast('Desktop notifications activated! 🔔', 'success');
  } else {
    showToast('Desktop notification permission was denied', 'info');
  }
});

// Device Modal Handling
elements.btnDeviceModal.addEventListener('click', () => {
  elements.deviceModal.classList.remove('hidden');
});

elements.btnCloseModal.addEventListener('click', () => {
  elements.deviceModal.classList.add('hidden');
});

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

// Reset Session (useful when switching phones from Android to iPhone)
elements.btnResetSession?.addEventListener('click', async () => {
  try {
    showToast('Clearing old session & generating fresh QR...', 'info');
    elements.qrImage.classList.add('hidden');
    elements.qrLoadingSpinner.classList.remove('hidden');
    const res = await fetch('/api/reset-session', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Session reset! Generating fresh QR code...', 'success');
    } else {
      showToast(data.error || 'Failed to reset session', 'error');
    }
  } catch (err) {
    showToast('Error resetting session', 'error');
  }
});

// Initialization
setDefaultScheduleDate(5);
fetchStatus();
fetchMessages();
fetchContacts();
fetchTemplates();
setupSSE();

// Sync initial toggle UI
if (state.soundEnabled && elements.btnSoundToggle) {
  elements.btnSoundToggle.classList.add('active');
}
if (state.notificationsEnabled && elements.btnNotifyToggle) {
  elements.btnNotifyToggle.classList.add('active');
}

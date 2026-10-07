const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 3030;
const DATA_DIR = path.join(__dirname, 'data');
const AUTH_DIR = path.join(DATA_DIR, 'auth_info_baileys');
const SCHEDULES_FILE = path.join(DATA_DIR, 'schedules.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
if (!fs.existsSync(SCHEDULES_FILE)) {
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify([], null, 2), 'utf-8');
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global WhatsApp State
let sock = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'scanning_qr' | 'connected'
let qrCodeDataUrl = null;
let qrRaw = null;
let lastQrTime = null;
let userInfo = null;
let isReconnecting = false;
let sseClients = new Set();

// Broadcast event to all SSE connected dashboard tabs
function broadcastSSE(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch (e) {
      // client may have closed
    }
  }
}

// Data persistence helpers
function loadSchedules() {
  try {
    const raw = fs.readFileSync(SCHEDULES_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading schedules.json:', e);
    return [];
  }
}

function saveSchedules(schedules) {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing schedules.json:', e);
  }
}

// Format Phone Number to WhatsApp JID
function formatJID(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.includes('@s.whatsapp.net') || trimmed.includes('@g.us')) {
    return trimmed;
  }
  const clean = trimmed.replace(/[^0-9]/g, '');
  if (clean.length < 7 || clean.length > 15) {
    return null;
  }
  return `${clean}@s.whatsapp.net`;
}

// Initialize WhatsApp Baileys connection
async function initWhatsApp(forceNew = false) {
  if (isReconnecting && !forceNew) return;
  isReconnecting = true;
  connectionStatus = 'connecting';
  broadcastSSE('status', getStatusPayload());

  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      defaultQueryTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrRaw = qr;
        lastQrTime = new Date().toISOString();
        connectionStatus = 'scanning_qr';
        try {
          qrCodeDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            scale: 8,
            color: {
              dark: '#111b21',
              light: '#ffffff'
            }
          });
        } catch (err) {
          console.error('Error generating QR DataURL:', err);
        }
        broadcastSSE('qr', { qrCodeDataUrl, generatedAt: lastQrTime });
        broadcastSSE('status', getStatusPayload());
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        qrCodeDataUrl = null;
        qrRaw = null;
        const userJid = sock.user?.id || '';
        const phone = userJid.split(':')[0].replace(/[^0-9]/g, '');
        userInfo = {
          id: userJid,
          phone: phone ? `+${phone}` : 'Connected',
          name: sock.user?.name || sock.user?.notify || 'WhatsApp User'
        };
        isReconnecting = false;
        console.log(`[WhatsApp] Connected successfully as ${userInfo.phone} (${userInfo.name})`);
        broadcastSSE('status', getStatusPayload());
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Connection closed. StatusCode: ${statusCode}. Reconnecting: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = 'disconnected';
          userInfo = null;
          qrCodeDataUrl = null;
          qrRaw = null;
          isReconnecting = false;
          // Clear credentials directory
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            fs.mkdirSync(AUTH_DIR, { recursive: true });
          } catch (e) {
            console.error('Failed to clean auth dir:', e);
          }
          broadcastSSE('status', getStatusPayload());
        } else {
          connectionStatus = 'connecting';
          broadcastSSE('status', getStatusPayload());
          setTimeout(() => {
            isReconnecting = false;
            initWhatsApp();
          }, 4000);
        }
      }
    });

  } catch (error) {
    console.error('[WhatsApp] Initialization error:', error);
    connectionStatus = 'disconnected';
    isReconnecting = false;
    broadcastSSE('status', getStatusPayload());
  }
}

function getStatusPayload() {
  return {
    status: connectionStatus,
    isConnected: connectionStatus === 'connected',
    user: userInfo,
    qrCodeDataUrl: qrCodeDataUrl,
    qrGeneratedAt: lastQrTime,
    serverTime: new Date().toISOString()
  };
}

// Background scheduler tick
async function processScheduledMessages() {
  const schedules = loadSchedules();
  const now = new Date();
  let modified = false;

  for (const item of schedules) {
    if (item.status === 'pending') {
      const scheduleTime = new Date(item.scheduledAt);
      if (scheduleTime <= now) {
        if (connectionStatus !== 'connected' || !sock) {
          item.attempts = (item.attempts || 0) + 1;
          item.notes = 'Delayed: WhatsApp is not connected. Will dispatch immediately upon reconnection.';
          modified = true;
          continue;
        }

        // Ready to dispatch
        item.status = 'sending';
        item.attempts = (item.attempts || 0) + 1;
        saveSchedules(schedules);
        broadcastSSE('schedule_updated', item);

        try {
          const jid = item.jid || formatJID(item.recipient);
          if (!jid) {
            throw new Error('Invalid phone number or JID format');
          }

          console.log(`[Scheduler] Dispatching message to ${jid}: "${item.message.slice(0, 30)}..."`);
          const sendResult = await sock.sendMessage(jid, { text: item.message });

          item.status = 'sent';
          item.sentAt = new Date().toISOString();
          item.waMessageId = sendResult?.key?.id || null;
          item.error = null;
          item.notes = 'Delivered successfully';
          modified = true;
          console.log(`[Scheduler] Message ${item.id} successfully sent!`);

          // Handle repeat logic (daily, weekly)
          if (item.repeat && item.repeat !== 'none') {
            const nextScheduleTime = new Date(item.scheduledAt);
            if (item.repeat === 'daily') {
              nextScheduleTime.setDate(nextScheduleTime.getDate() + 1);
            } else if (item.repeat === 'weekly') {
              nextScheduleTime.setDate(nextScheduleTime.getDate() + 7);
            }

            const recurringItem = {
              id: uuidv4(),
              recipient: item.recipient,
              recipientName: item.recipientName,
              jid: item.jid,
              message: item.message,
              scheduledAt: nextScheduleTime.toISOString(),
              createdAt: new Date().toISOString(),
              status: 'pending',
              sentAt: null,
              error: null,
              repeat: item.repeat,
              attempts: 0
            };
            schedules.push(recurringItem);
            broadcastSSE('schedule_created', recurringItem);
          }

        } catch (dispatchErr) {
          console.error(`[Scheduler] Failed to dispatch message ${item.id}:`, dispatchErr);
          item.status = 'failed';
          item.failedAt = new Date().toISOString();
          item.error = dispatchErr.message || 'Unknown send error';
          modified = true;
        }

        broadcastSSE('schedule_updated', item);
      }
    }
  }

  if (modified) {
    saveSchedules(schedules);
  }
}

// Run scheduler checks every 3 seconds
setInterval(processScheduledMessages, 3000);

// --- REST API ROUTES ---

// SSE Stream
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const client = { id: uuidv4(), res };
  sseClients.add(client);

  // Send initial state immediately
  client.res.write(`event: status\ndata: ${JSON.stringify(getStatusPayload())}\n\n`);

  // Heartbeat ping every 20 seconds
  const heartbeat = setInterval(() => {
    try {
      client.res.write(': heartbeat\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// Get current status
app.get('/api/status', (req, res) => {
  res.json(getStatusPayload());
});

// Request 8-digit Pairing Code via Phone Number
app.post('/api/request-pairing-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length < 8 || clean.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number length (must be 8-15 digits including country code)' });
    }

    if (!sock) {
      return res.status(503).json({ error: 'WhatsApp client is not ready. Please refresh.' });
    }

    const code = await sock.requestPairingCode(clean);
    // Format code as ABCD-EFGH for readability
    const formattedCode = code ? (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code) : code;
    return res.json({ success: true, pairingCode: formattedCode });
  } catch (err) {
    console.error('Error requesting pairing code:', err);
    return res.status(500).json({ error: err.message || 'Failed to request pairing code' });
  }
});

// Logout and reset WhatsApp session
app.post('/api/logout', async (req, res) => {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch (e) {}
    }
    try {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    } catch (e) {}

    connectionStatus = 'disconnected';
    userInfo = null;
    qrCodeDataUrl = null;
    qrRaw = null;
    isReconnecting = false;

    // Reinitialize to prepare fresh QR code
    setTimeout(() => initWhatsApp(true), 1000);

    broadcastSSE('status', getStatusPayload());
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconnect WhatsApp
app.post('/api/reconnect', async (req, res) => {
  try {
    isReconnecting = false;
    await initWhatsApp(true);
    res.json({ success: true, message: 'Reconnection triggered' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all scheduled messages
app.get('/api/messages', (req, res) => {
  const schedules = loadSchedules();
  // Sort by scheduledAt ascending
  schedules.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  res.json(schedules);
});

// Create a new scheduled message (or send immediately)
app.post('/api/messages', async (req, res) => {
  try {
    const { recipient, recipientName, message, scheduledAt, repeat, sendImmediately } = req.body;

    if (!recipient || !message) {
      return res.status(400).json({ error: 'Recipient phone number and message are required' });
    }

    const jid = formatJID(recipient);
    if (!jid) {
      return res.status(400).json({
        error: 'Invalid recipient phone number. Please include country code (e.g. +1 555 123 4567 or +91 98765 43210).'
      });
    }

    let targetTime = scheduledAt ? new Date(scheduledAt) : new Date();
    if (isNaN(targetTime.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled time format' });
    }

    // If sendImmediately is true, set time to now
    if (sendImmediately) {
      targetTime = new Date();
    }

    const newItem = {
      id: uuidv4(),
      recipient: recipient.trim(),
      recipientName: (recipientName || '').trim() || null,
      jid,
      message: message.trim(),
      scheduledAt: targetTime.toISOString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
      sentAt: null,
      error: null,
      repeat: repeat || 'none', // 'none' | 'daily' | 'weekly'
      attempts: 0
    };

    const schedules = loadSchedules();
    schedules.push(newItem);
    saveSchedules(schedules);

    broadcastSSE('schedule_created', newItem);

    // If sendImmediately, trigger instant cycle
    if (sendImmediately) {
      setImmediate(processScheduledMessages);
    }

    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Immediate Dispatch: "Send Now" button for any pending message
app.post('/api/messages/:id/send-now', async (req, res) => {
  const { id } = req.params;
  const schedules = loadSchedules();
  const item = schedules.find(s => s.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Scheduled message not found' });
  }

  item.scheduledAt = new Date().toISOString();
  item.status = 'pending';
  item.error = null;
  saveSchedules(schedules);

  broadcastSSE('schedule_updated', item);
  setImmediate(processScheduledMessages);

  res.json({ success: true, message: 'Message queued for immediate send', item });
});

// Retry a failed message
app.post('/api/messages/:id/retry', async (req, res) => {
  const { id } = req.params;
  const schedules = loadSchedules();
  const item = schedules.find(s => s.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Message not found' });
  }

  item.status = 'pending';
  item.scheduledAt = new Date().toISOString();
  item.error = null;
  item.attempts = 0;
  saveSchedules(schedules);

  broadcastSSE('schedule_updated', item);
  setImmediate(processScheduledMessages);

  res.json({ success: true, message: 'Message reset to pending', item });
});

// Update/Edit an existing scheduled message
app.patch('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const { recipient, recipientName, message, scheduledAt, repeat } = req.body;
  const schedules = loadSchedules();
  const item = schedules.find(s => s.id === id);

  if (!item) {
    return res.status(404).json({ error: 'Message not found' });
  }

  if (recipient) {
    const jid = formatJID(recipient);
    if (!jid) {
      return res.status(400).json({ error: 'Invalid recipient phone number format' });
    }
    item.recipient = recipient.trim();
    item.jid = jid;
  }

  if (recipientName !== undefined) {
    item.recipientName = recipientName.trim() || null;
  }

  if (message !== undefined) {
    if (!message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    item.message = message.trim();
  }

  if (scheduledAt) {
    const date = new Date(scheduledAt);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduledAt datetime' });
    }
    item.scheduledAt = date.toISOString();
    // If it was failed, allow rescheduling back to pending
    if (item.status === 'failed') item.status = 'pending';
  }

  if (repeat !== undefined) {
    item.repeat = repeat;
  }

  saveSchedules(schedules);
  broadcastSSE('schedule_updated', item);
  res.json(item);
});

// Cancel or Delete a scheduled message
app.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const schedules = loadSchedules();
  const index = schedules.findIndex(s => s.id === id);

  if (index === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const removed = schedules.splice(index, 1)[0];
  saveSchedules(schedules);

  broadcastSSE('schedule_deleted', { id });
  res.json({ success: true, message: 'Message removed', item: removed });
});

// Start Express server and connect WhatsApp (Bound strictly to 127.0.0.1 for maximum privacy)
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Server] WhatsApp Message Scheduler listening securely on http://127.0.0.1:${PORT}`);
  initWhatsApp();
});

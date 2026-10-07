# 📱 WhatsApp Message Scheduler

A local web application and background scheduler to connect your WhatsApp account, compose messages, and schedule automated message deliveries with real-time countdowns and delivery logs.

---

## 🚀 Features

- **Personal WhatsApp Linking**:
  - Connect your existing personal WhatsApp via **QR Code scanning** (multi-device session).
  - Alternative **8-digit pairing code** option without using your phone's camera.
  - Persistent authentication saved securely in `./data/auth_info_baileys`.
- **Message Scheduling**:
  - Exact date & time picker + quick presets (`+2m`, `+5m`, `+15m`, `+1h`, `Tomorrow 9 AM`, `Tomorrow 8 PM`).
  - Optional recurrence (Daily, Weekly, One-time).
  - Quick-start message templates (Meeting Reminders, Birthday Wishes, Follow-ups, Daily Standups).
  - Formatting helpers (`*bold*`, `_italics_`, `~strike~`, emojis).
- **Queue Management**:
  - Live ticking delivery countdown timer for pending messages.
  - Immediate dispatch ("Send Now ⚡") test button.
  - Reschedule, edit, retry failed, or cancel messages.
  - Real-time updates via Server-Sent Events (SSE).

---

## 🛠️ Architecture & Tech Stack

- **Backend**: Node.js, Express, `@whiskeysockets/baileys` (native multi-device WebSocket connection).
- **Frontend**: Vanilla HTML5, Modern CSS Design System (WhatsApp Emerald Dark Mode & Glassmorphism), and Vanilla JavaScript.
- **Real-Time Layer**: Server-Sent Events (SSE) `/api/events`.
- **Database**: Local JSON storage (`./data/schedules.json`).

---

## 🏃 Running the Application

### 1. Start the Server
```bash
cd /Users/yuvi/.gemini/antigravity-ide/scratch/whatsapp-scheduler
npm start
```
The server will start on **`http://localhost:3030`**.

### 2. Connect Your WhatsApp
1. Open [http://localhost:3030](http://localhost:3030) in your browser.
2. Click **Link Device** (or wait for the QR dialog).
3. On your phone:
   - Open **WhatsApp** &rarr; **Settings** (iOS) or **Menu ⋮** (Android).
   - Tap **Linked Devices** &rarr; **Link a Device**.
   - Point your phone camera at the QR code on the screen.
4. Once scanned, your status will instantly change to **Connected**!

### 3. Schedule Messages
1. Enter the recipient's phone number with country code (e.g., `+1 555 123 4567` or `+91 98765 43210`).
2. Write your message or pick a prebuilt template.
3. Choose your target date and time.
4. Click **Schedule Message**!

---

## 🔒 100% Privacy & Security Guarantee

- **Zero Cloud / Zero Third-Party Servers**: No code or data ever leaves your computer to any external server or analytics service.
- **Strictly Localhost**: The web server binds strictly to `127.0.0.1`, meaning no device on your Wi-Fi or local network can access it.
- **Official End-to-End Encryption**: All messages travel directly between your Mac and WhatsApp's official servers via the Noise Protocol / Signal Protocol.
- **Isolated Storage**: All session keys and scheduled queues are stored locally inside `./data/` and excluded from git.

---

## 🌙 Delivering Messages When Laptop Lid is Closed (100% Locally)

To keep your scheduled messages delivering on time when your MacBook lid is closed without using any cloud servers:

### Option 1: Built-in macOS Setting (Recommended)
1. Keep your MacBook **connected to power (charger)**.
2. In Terminal, run:
   ```bash
   sudo pmset -a disablesleep 1
   ```
   *Your Mac will keep the processor and Wi-Fi active with the lid closed (display turns off to save power).*
3. To re-enable normal sleep behavior anytime:
   ```bash
   sudo pmset -a disablesleep 0
   ```

### Option 2: Use Amphetamine (Free on Mac App Store)
Install **Amphetamine**, set a session with *"Allow system sleep when display is closed"* unchecked, and keep your MacBook plugged into power.


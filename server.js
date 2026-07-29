import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatFn } from './index.js';
import cors from 'cors';
import { getAuthUrl, getTokensFromCode } from './googleCalendar.js';
import { saveToken, getToken, hasToken, deleteToken } from './tokenStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Verification Routes ───────────────────────────────────

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'terms.html'));
});

// ─── Chat Endpoint ────────────────────────────────────────

app.post('/chat', async (req, res) => {
    let { message, sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
    }

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // Look up the user's refresh token from the database
        const refreshToken = getToken(sessionId);

        const result = await ChatFn({ query: message, sessionId, refreshToken });
        res.json(result);
    } catch (err) {
        console.error('Chat error:', err.message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

// ─── Google OAuth: Step 1 — Redirect to consent screen ────

app.get('/auth/google', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
        return res.status(400).send('Missing sessionId');
    }

    const url = getAuthUrl(sessionId);
    res.redirect(url);
});

// ─── Google OAuth: Step 2 — Handle callback ───────────────

app.get('/oauth/callback', async (req, res) => {
    const { code, state: sessionId } = req.query;

    if (!code) {
        return res.status(400).send('Missing authorization code');
    }
    if (!sessionId) {
        return res.status(400).send('Missing session state');
    }

    try {
        const tokens = await getTokensFromCode(code);
        const refreshToken = tokens.refresh_token;

        if (refreshToken) {
            // Save to SQLite database
            saveToken(sessionId, refreshToken);
            console.log(`✅ Google Calendar connected for session: ${sessionId.substring(0, 8)}...`);
        }

        // Return a page that closes the popup and notifies the parent window
        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Connected!</title></head>
            <body style="background:#0a0a0f;color:#e8e8f0;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <div style="text-align:center;">
                    <h1 style="font-size:48px;margin:0;">✅</h1>
                    <h2>Google Calendar Connected!</h2>
                    <p style="color:#8888a8;">This window will close automatically...</p>
                </div>
                <script>
                    // Notify parent window that OAuth is complete
                    if (window.opener) {
                        window.opener.postMessage({ type: 'oauth-complete' }, '*');
                    }
                    setTimeout(() => window.close(), 1500);
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('OAuth error:', err.message);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <body style="background:#0a0a0f;color:#e8e8f0;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
                <div style="text-align:center;">
                    <h1 style="font-size:48px;margin:0;">❌</h1>
                    <h2>Authentication Failed</h2>
                    <p style="color:#ff4d6a;">${err.message}</p>
                    <p style="color:#8888a8;">Please close this window and try again.</p>
                </div>
            </body>
            </html>
        `);
    }
});

// ─── Auth Status — check if session is connected ──────────

app.get('/auth/status', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) {
        return res.json({ connected: false });
    }
    res.json({ connected: hasToken(sessionId) });
});

// ─── Disconnect Google Calendar ───────────────────────────

app.post('/auth/disconnect', (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID is required' });
    }
    deleteToken(sessionId);
    console.log(`🔌 Google Calendar disconnected for session: ${sessionId.substring(0, 8)}...`);
    res.json({ disconnected: true });
});

// ─── Start Server ─────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🚀 Lara is running at http://localhost:${PORT}`);
    console.log(`📅 Users can connect their Google Calendar from the chat UI\n`);
});

export { app };
import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatFn } from './index.js';
import cors from 'cors';
import { getAuthUrl, getTokensFromCode, setRefreshToken } from './googleCalendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/chat', async (req, res) => {
    let { message, sessionId } = req.body;
    if (!sessionId) {
        sessionId = Math.floor(Math.random() * 1000) + 1;
    }

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    const result = await ChatFn({ query: message, sessionId });
    console.log(result);
    res.json(result);
});

// Google OAuth: Step 1 — Redirect user to Google consent screen
app.get('/auth/google', (req, res) => {
    const url = getAuthUrl();
    res.redirect(url);
});

// Google OAuth: Step 2 — Exchange auth code for tokens and auto-save to .env
app.get('/oauth/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send('Missing authorization code');
    }

    try {
        const tokens = await getTokensFromCode(code);
        const refreshToken = tokens.refresh_token;

        if (refreshToken) {
            // Update the in-memory env variable
            process.env.GOOGLE_REFRESH_TOKEN = refreshToken;

            // Also update the OAuth2 client so it works immediately
            setRefreshToken(refreshToken);

            // Auto-save refresh token to .env file
            try {
                let envContent = fs.readFileSync(envPath, 'utf-8');
                if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                    envContent = envContent.replace(
                        /GOOGLE_REFRESH_TOKEN=".*"/,
                        `GOOGLE_REFRESH_TOKEN="${refreshToken}"`
                    );
                } else {
                    envContent += `\nGOOGLE_REFRESH_TOKEN="${refreshToken}"`;
                }
                fs.writeFileSync(envPath, envContent, 'utf-8');
                console.log('\n✅ Refresh token saved to .env automatically!');
            } catch (writeErr) {
                console.error('⚠️  Could not auto-save to .env:', writeErr.message);
                console.log('Manually add this to .env:');
                console.log(`GOOGLE_REFRESH_TOKEN="${refreshToken}"`);
            }

            console.log('\n========================================');
            console.log('🎉 Google Calendar authenticated!');
            console.log('========================================\n');
        }

        res.send(`
            <h1>✅ Google Calendar Connected!</h1>
            <p>Authentication complete. The refresh token has been saved automatically.</p>
            <p>You can close this tab and start using calendar features.</p>
        `);
    } catch (err) {
        console.error('OAuth error:', err.message);
        res.status(500).send(`OAuth error: ${err.message}`);
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Auto-authenticate: if no refresh token, open browser to start OAuth
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
        console.log('\n⚠️  No Google refresh token found. Opening browser for authentication...\n');
        const authUrl = `http://localhost:${PORT}/auth/google`;
        // macOS: use 'open', Linux: 'xdg-open', Windows: 'start'
        exec(`open "${authUrl}"`, (err) => {
            if (err) {
                console.log(`Could not open browser automatically. Please visit:\n${authUrl}\n`);
            }
        });
    } else {
        console.log('✅ Google Calendar authenticated (refresh token found)');
    }
});

export { app };
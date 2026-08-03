const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({ origin: '*' })); // restrict this to your actual frontend origin(s) in production
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

// LiveKit access-token endpoint
// The API key/secret stay server-side only (set via env vars), never sent to the browser.
// LiveKit Cloud handles SFU routing + TURN/STUN itself, so no ICE-credential proxying
// or Socket.IO signaling is needed any more — the client just needs a signed JWT.
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

app.post('/api/livekit-token', async (req, res) => {
  try {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(500).json({ error: 'LiveKit API key/secret are not configured on the server' });
    }

    const { roomId, identity } = req.body || {};
    if (!roomId || !identity) {
      return res.status(400).json({ error: 'roomId and identity are required' });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity });
    at.addGrant({ roomJoin: true, room: roomId, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    res.json({ token });
  } catch (err) {
    console.error('Failed to mint LiveKit token:', err.message);
    res.status(500).json({ error: 'Failed to mint LiveKit token' });
  }
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

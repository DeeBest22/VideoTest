const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // restrict this to your actual frontend origin(s) in production
    methods: ['GET', 'POST']
  }
});

// NOTE: Socket.IO's cors option above only covers the socket transport.
// Regular Express/HTTP routes (like /api/turn-credentials) need their own
// CORS middleware, or browser fetch() calls from a different origin will be
// blocked and silently fail.
app.use(cors({ origin: '*' })); // restrict this to your actual frontend origin(s) in production

app.use(express.static(path.join(__dirname, 'public')));

// TURN/STUN credentials endpoint
// The Metered API key stays server-side only (set via env var), never sent to the browser.
// A short in-memory cache avoids hitting Metered's API on every single page load.
const METERED_API_KEY = process.env.METERED_API_KEY;
const METERED_APP_NAME = process.env.METERED_APP_NAME || 'convoapp'; // e.g. "convoapp" from convoapp.metered.live

let cachedIceServers = null;
let cacheExpiresAt = 0;

app.get('/api/turn-credentials', async (req, res) => {
  try {
    if (!METERED_API_KEY) {
      return res.status(500).json({ error: 'METERED_API_KEY is not configured on the server' });
    }

    const now = Date.now();
    if (cachedIceServers && now < cacheExpiresAt) {
      return res.json(cachedIceServers);
    }

    const url = `https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Metered API responded with ${response.status}`);
    }

    const iceServers = await response.json();

    // Metered TURN credentials are typically valid for a while; cache for 1 hour to be safe.
    cachedIceServers = iceServers;
    cacheExpiresAt = now + 60 * 60 * 1000;

    res.json(iceServers);
  } catch (err) {
    console.error('Failed to fetch TURN credentials:', err.message);
    res.status(502).json({ error: 'Failed to fetch TURN credentials' });
  }
});

io.on('connection', (socket) => {
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', socket.id);

    socket.on('signal', (data) => {
      io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-disconnected', socket.id);
    });
  });
});

app.get('/health', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

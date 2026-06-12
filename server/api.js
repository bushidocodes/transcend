const api = require('express').Router();

api.use('/auth', require('./auth'));

api.get('/ice-servers', (req, res) => {
  const iceServers = [
    { urls: process.env.STUN_URL || 'stun:stun.l.google.com:19302' }
  ];
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }
  res.json({ iceServers });
});

// No routes matched? 404.
api.use((req, res) => res.status(404).end());

module.exports = api;

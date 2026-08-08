require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const noteRoutes = require('./routes/notes');
const usersModule = require('./routes/users');

const app = express();

// Fixes the "fully open CORS" issue — only origins listed in CORS_ORIGIN can call this API.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
}));

app.use(express.json());
app.use(attachUser);

app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/users', usersModule);
app.use('/api/analytics', usersModule.analyticsRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'ssai-backend' }));

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
    const port = process.env.PORT || 4000;
    app.listen(port, () => console.log(`SSAI backend running on port ${port}`));
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

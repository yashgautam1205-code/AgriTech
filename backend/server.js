require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const fs = require('fs');

const scanRoutes = require('./routes/scanRoutes');
const { connectDB } = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const uploadPath = path.join(__dirname, UPLOAD_DIR);
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
app.use('/uploads', express.static(uploadPath));
app.use(express.urlencoded({ extended: true }));

// connect DB and continue in degraded mode if MongoDB is unavailable
connectDB()
  .then(() => {
    console.log('MongoDB connect attempt completed.');
  })
  .catch((err) => {
    console.warn('MongoDB connect promise rejected:', err);
  });

app.use('/api', scanRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err && err.message ? err.message : err);

  if (res.headersSent) {
    return next(err);
  }

  if (err && err.name === 'MulterError') {
    return res.status(400).json({ message: err.message, error: err.code });
  }

  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON payload', error: err.message });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON payload', error: err.message });
  }

  return res.status(500).json({
    message: err.message || 'Server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'AI Crop Doctor backend is running' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

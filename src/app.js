// File: src/app.js

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');
const markdownRoutes = require('./routes/markdownRoutes');

// Initialize express app
const app = express();

// Enable trust proxy
app.set('trust proxy', true);

// Set up middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies with size limit
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies

// Setup request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// API Key authentication middleware
const apiKeyAuth = (req, res, next) => {
  // Skip API key check for health endpoint
  if (req.path === '/health') {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    logger.warn(`Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Invalid API key'
    });
  }
  next();
};

// Add authentication check middleware
const authenticateOAuthRequest = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Only check OAuth for markdown API routes
    if (req.path.startsWith('/api/markdown/convert-to-gdoc')) {
      logger.warn(`Unauthorized access attempt from ${req.ip} - Missing Bearer token`);
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Missing or invalid Bearer token'
      });
    }
  }
  next();
};

// Apply authentication middlewares
if (process.env.API_KEY) {
  app.use(apiKeyAuth);
}
app.use(authenticateOAuthRequest);

// Register routes
app.use('/api/markdown', markdownRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

module.exports = app;
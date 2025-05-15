// File: src/utils/markdownProcessor.js

const logger = require('./logger');
const { formatMarkdownToGoogleDocsRequests } = require('./googleDocsFormatter');

/**
 * Process markdown content and convert to Google Docs format using googleDocsFormatter
 * which initializes showdown.
 *
 * @param {string} markdown - Markdown content
 * @returns {Object} Google Docs formatted content (array of requests)
 */
exports.processMarkdown = (markdown) => {
  try {
    logger.info('Processing markdown to Google Docs format using googleDocsFormatter (with Showdown initialization)');
    
    // Delegate to the formatter function which uses showdown
    const { requests } = formatMarkdownToGoogleDocsRequests(markdown);

    logger.info(`Successfully processed markdown to Google Docs format with ${requests.length} requests`);

    return {
      requests
    };
  } catch (error) {
    logger.error(`Error processing markdown via googleDocsFormatter: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw the error so the controller can handle it
  }
};
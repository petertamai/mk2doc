// File: src/utils/markdownProcessor.js

const logger = require('./logger');

/**
 * Process markdown content and convert to Google Docs format
 *
 * NOTE: This implementation uses a manual line-by-line parsing approach
 * with regular expressions. While simple, it has significant limitations
 * compared to using a dedicated markdown parsing library (like 'marked')
 * and may not correctly handle complex markdown features, nested formatting,
 * or edge cases.
 *
 * The error "renderer 'elements' does not exist" comes from the 'marked'
 * library and is NOT caused by this specific code file, as it does not
 * use 'marked'. If you are seeing that error, it is likely from a different
 * file or an older version of this file.
 *
 * @param {string} markdown - Markdown content
 * @returns {Object} Google Docs formatted content (array of requests)
 */
exports.processMarkdown = (markdown) => {
  try {
    logger.info('Processing markdown to Google Docs format using manual parser');

    // Directly parse the markdown using manual logic 
    const requests = convertMarkdownToRequests(markdown);

    logger.info(`Successfully processed markdown to Google Docs format with ${requests.length} requests`);

    return {
      requests
    };
  } catch (error) {
    // This catch block will only catch errors within the manual parsing logic,asd
    // not the 'marked' error mentioned in the logs.
    logger.error(`Error processing markdown: ${error.message}`, { stack: error.stack });
    throw error; // Re-throw the error so the controller can handle it
  }
};

/**
 * Convert markdown directly to Google Docs API requests using manual parsing.
 *
 * WARNING: This manual parsing is basic and has limitations.
 *
 * @param {string} markdown - Markdown content
 * @returns {Array} Array of Google Docs API requests
 */
function convertMarkdownToRequests(markdown) {
  const requests = [];
  // Start index at 1 because the document is created with a default title paragraph at index 0.
  // Content will be inserted after the title.
  let index = 1;

  // Split the markdown into lines
  const lines = markdown.split('\n');

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines - insert a newline to maintain spacing
    if (line.trim() === '') {
      requests.push({
        insertText: {
          text: '\n',
          location: { index }
        }
      });
      index += 1; // +1 for the newline character
      continue;
    }

    // --- Process Block Elements ---

    // Process headings (e.g., # Heading 1, ## Heading 2)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];

      // Insert the heading text
      requests.push({
        insertText: {
          text: text + '\n', // Add newline after heading
          location: { index }
        }
      });

      // Apply heading style to the inserted text
      requests.push({
        updateParagraphStyle: {
          paragraphStyle: {
            namedStyleType: `HEADING_${level}`
          },
          range: {
            startIndex: index,
            endIndex: index + text.length // Range covers the text content
          },
          fields: 'namedStyleType'
        }
      });

      index += text.length + 1; // +1 for the newline character
      continue;
    }

    // Process code blocks (basic fenced blocks)
    // This only handles blocks starting with ``` on a line by itself
    if (line.trim().startsWith('```')) {
      // Check if it's the start of a fenced code block
      const codeStartMatch = line.trim().match(/^```([a-zA-Z0-9]*)?$/);
      if (codeStartMatch) {
        let codeContent = '';
        let j = i + 1;

        // Collect lines until the closing ```
        while (j < lines.length && !lines[j].trim().startsWith('```')) {
          codeContent += lines[j] + '\n'; // Keep original line breaks within code
          j++;
        }

        // Insert the code content
        requests.push({
          insertText: {
            text: codeContent,
            location: { index }
          }
        });

        // Apply code style (monospaced font, background) to the inserted text
        requests.push({
          updateTextStyle: {
            textStyle: {
              fontFamily: 'Courier New', // Common monospaced font
              backgroundColor: {
                color: {
                  rgbColor: {
                    red: 0.95, // Light grey background
                    green: 0.95,
                    blue: 0.95
                  }
                }
              }
            },
            range: {
              startIndex: index,
              endIndex: index + codeContent.length // Range covers the code content
            },
            fields: 'fontFamily,backgroundColor'
          }
        });

        index += codeContent.length; // Advance index by the length of the code content
        i = j; // Skip lines that were part of the code block
        continue; // Move to the next line after the code block
      }
    }

    // Process lists (bulleted and numbered)
    // NOTE: This handles only the first level and basic indentation.
    // Nested lists and complex list structures require more sophisticated parsing.
    const bulletedListMatch = line.match(/^(\s*)[-*+]\s+(.+)$/); // Added + for bullet options
    const numberedListMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);

    if (bulletedListMatch || numberedListMatch) {
      const match = bulletedListMatch || numberedListMatch;
      const indent = match[1].length; // Number of leading spaces
      const text = match[2];

      // Insert the list item text
      requests.push({
        insertText: {
          text: text + '\n', // Add newline after list item
          location: { index }
        }
      });

      // Apply bullet/numbering
      requests.push({
        createParagraphBullets: {
          range: {
            startIndex: index,
            endIndex: index + text.length // Range covers the text content
          },
          // NOTE: This applies a flat bullet/numbering style.
          // Handling nested list levels correctly requires setting the 'level' property
          // in createParagraphBullets and managing indentation based on nesting depth,
          // which is complex with this line-by-line approach.
          bulletPreset: bulletedListMatch ? 'BULLET_DISC_CIRCLE_SQUARE' : 'NUMBERED_DECIMAL_NESTED'
        }
      });

      // Apply indentation based on leading spaces
      // NOTE: This is a simplistic approach to indentation and may not align
      // perfectly with how Google Docs handles nested list indents.
      if (indent > 0) {
        requests.push({
          updateParagraphStyle: {
            paragraphStyle: {
              indentStart: {
                magnitude: indent * 18, // Rough estimate for indentation per 2 spaces
                unit: 'PT'
              },
              // indentFirstLine is typically used for hanging indents in lists,
              // setting it to 0 might not be correct depending on desired style.
              indentFirstLine: {
                magnitude: 0,
                unit: 'PT'
              }
            },
            range: {
              startIndex: index,
              endIndex: index + text.length // Range covers the text content
            },
            fields: 'indentStart,indentFirstLine'
          }
        });
      }

      index += text.length + 1; // +1 for the newline character
      continue;
    }

    // --- Process Regular Paragraphs and Inline Formatting ---

    // If it's not a recognized block element, treat as a paragraph
    // Insert the line content first
    requests.push({
      insertText: {
        text: line + '\n', // Add newline after paragraph
        location: { index }
      }
    });

    // Process inline formatting (bold, italic, links) within this line
    // WARNING: This inline formatting logic is flawed. It applies formatting
    // to ranges within the string *including* the markdown syntax (**,* etc.).
    // A proper parser would remove the syntax and apply formatting to the content.
    // It also doesn't handle nested inline formatting correctly.
    processInlineFormatting(requests, line, index);

    index += line.length + 1; // +1 for the newline character
  }

  return requests;
}

/**
 * Process inline formatting (bold, italic, links) in text.
 *
 * WARNING: This function is flawed. It calculates ranges based on the text
 * *including* markdown syntax and applies formatting to those ranges.
 * This will result in the markdown syntax characters (**,* etc.) appearing
 * in the final document with formatting applied to them, which is incorrect.
 * A proper solution requires parsing the line into segments (text, bold, link)
 * and inserting/formatting them sequentially.
 *
 * @param {Array} requests - Array of Google Docs API requests to add to
 * @param {string} text - Text line to process (includes markdown syntax)
 * @param {number} startIndex - Starting index in the document where this line was inserted
 */
function processInlineFormatting(requests, text, startIndex) {
  // Process bold (** or __)
  // Finds **bold** or __bold__
  const boldRegex = /(\*\*|__)(.*?)\1/g;
  let match;

  while ((match = boldRegex.exec(text)) !== null) {
    const matchText = match[2]; // The text content inside the bold markers
    // Calculate start/end indices relative to the start of the *original line*
    // This range *includes* the bold markers (e.g., **text**)
    const matchStart = match.index; // Start of the full match (**text**)
    const matchEnd = match.index + match[0].length; // End of the full match

    // Apply bold style to the range including the markdown syntax
    // This is incorrect behavior for a markdown renderer.
    requests.push({
      updateTextStyle: {
        textStyle: {
          bold: true
        },
        range: {
          startIndex: startIndex + matchStart,
          endIndex: startIndex + matchEnd
        },
        fields: 'bold'
      }
    });

    // NOTE: To fix this, you would need to calculate the range of the *content* (matchText)
    // *after* the text has been inserted without the markdown syntax, which is complex
    // with this line-by-line insertion method.
  }

  // Process italic (* or _)
  // Finds *italic* or _italic_ (basic, avoids ** and __)
  // The regex used here is complex and might have edge cases.
  // A simpler regex like /(\*|_)(.*?)\1/g is common but needs careful handling
  // of nested/escaped characters and conflicts with bold.
  const italicRegex = /(?<!\*|_)(\*|_)((?!\1).*?)\1(?!\1)/g; // Uses negative lookbehind/ahead

  // Removed the try...catch block as it hides potential regex issues.
  // If the regex is invalid or causes errors, it should fail.
  while ((match = italicRegex.exec(text)) !== null) {
    const matchText = match[2]; // The text content inside the italic markers
    // Calculate start/end indices relative to the start of the *original line*
    // This range *includes* the italic markers (e.g., *text*)
    const matchStart = match.index; // Start of the full match (*text*)
    const matchEnd = match.index + match[0].length; // End of the full match

    // Apply italic style to the range including the markdown syntax
    // This is incorrect behavior for a markdown renderer.
    requests.push({
      updateTextStyle: {
        textStyle: {
          italic: true
        },
        range: {
          startIndex: startIndex + matchStart,
          endIndex: startIndex + matchEnd
        },
        fields: 'italic'
      }
    });

    // NOTE: Same issue as bold - range includes syntax.
  }

  // Process links [text](url)
  // Finds [link text](url)
  const linkRegex = /\[(.*?)\]\((.*?)\)/g;

  while ((match = linkRegex.exec(text)) !== null) {
    const linkText = match[1]; // The text inside the brackets []
    const linkUrl = match[2]; // The URL inside the parentheses ()
    // Calculate start/end indices relative to the start of the *original line*
    // This range covers the [link text] part of the markdown syntax
    const linkStart = match.index; // Start of the full match [text](url)
    const linkEnd = match.index + match[0].length; // End of the full match

    // Apply link style to the range including the markdown syntax [text](url)
    // This will make the entire "[text](url)" string appear, with the part
    // corresponding to "[text]" being a clickable link. This is usually not
    // the desired markdown rendering (which typically just shows "text" as a link).
    requests.push({
      updateTextStyle: {
        textStyle: {
          link: {
            url: linkUrl
          }
        },
        range: {
          startIndex: startIndex + linkStart,
          endIndex: startIndex + linkEnd
        },
        fields: 'link'
      }
    });

    // NOTE: To render correctly (just "text" as a link), you would need to
    // insert the 'linkText' part separately and apply the link style to that,
    // while skipping the insertion of the '[', ']', '(', ')', and 'linkUrl' parts.
    // This requires parsing the line into segments before insertion. ss
  }

  // NOTE: This function does not handle other inline formatting like
  // inline code (`code`), strikethrough (~~text~~), images (![alt](url)), etc.
}
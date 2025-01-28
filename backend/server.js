// server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { faker } = require('@faker-js/faker');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');

const app = express();
const PORT = 3001;

// Initialize cache with a TTL of 1 day (86400 seconds)
const translationCache = new NodeCache({ stdTTL: 86400, checkperiod: 120 });

// Middleware Setup
app.use(cors());
app.use(express.json());

// Helper Functions

/**
 * Maps frontend region codes to Faker locale codes.
 * @param {string} region - The region code from the frontend (e.g., 'en', 'fr', 'de').
 * @returns {string} - The corresponding Faker locale code.
 */
function getFakerLocale(region) {
  switch (region) {
    case 'en':
      return 'en_US';
    case 'fr':
      return 'fr';
    case 'de':
      return 'de';
    // Add more mappings as needed
    default:
      return 'en_US'; // Default to English (US)
  }
}

/**
 * Generates a hash code from a string.
 * @param {string} str - The input string.
 * @returns {number} - The resulting hash code.
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Determines a fractional value based on an average.
 * @param {number} avg - The average value.
 * @returns {number} - The resulting integer value.
 */
function fractionalValue(avg) {
  const intPart = Math.floor(avg);
  const fraction = avg - intPart;
  let val = intPart;
  if (Math.random() < fraction) {
    val++;
  }
  return val;
}

// Translation Proxy Endpoint

/**
 * POST /api/translate
 * Translates text using MyMemory Translation API with caching.
 * Expects a JSON body with { q, source, target }.
 */
app.post('/api/translate', async (req, res) => {
  const { q, source, target } = req.body;

  // Input Validation
  if (!q || !source || !target) {
    return res.status(400).json({ error: 'Missing required fields: q, source, target' });
  }

  try {
    // Determine if 'q' is an array or a single string
    const isArray = Array.isArray(q);
    const textsToTranslate = isArray ? q : [q];

    // Prepare cache keys
    const cacheKeys = textsToTranslate.map(text => `${source}-${target}-${text}`);

    // Check cache for existing translations
    const cachedTranslations = cacheKeys.map(key => translationCache.get(key));

    // Identify texts that need translation
    const textsToFetch = [];
    const indexesToFetch = [];

    cachedTranslations.forEach((translation, index) => {
      if (translation === undefined) {
        textsToFetch.push(textsToTranslate[index]);
        indexesToFetch.push(index);
      }
    });

    let fetchedTranslations = [];

    if (textsToFetch.length > 0) {
      // Make API call to MyMemory for texts that are not cached
      const translationPromises = textsToFetch.map(text =>
        axios.get('https://api.mymemory.translated.net/get', {
          params: {
            q: text,
            langpair: `${source}|${target}`,
          },
        })
      );

      const responses = await Promise.all(translationPromises);
      fetchedTranslations = responses.map(response => response.data.responseData.translatedText);

      // Store fetched translations in cache
      fetchedTranslations.forEach((translatedText, idx) => {
        const cacheKey = cacheKeys[indexesToFetch[idx]];
        translationCache.set(cacheKey, translatedText);
      });
    }

    // Assemble final translations
    let finalTranslations = cachedTranslations.slice();

    indexesToFetch.forEach((idx, fetchIdx) => {
      finalTranslations[idx] = fetchedTranslations[fetchIdx];
    });

    // If original 'q' was a single string, return a single translation
    if (!isArray) {
      return res.json({ translatedText: finalTranslations[0] });
    }

    // Otherwise, return the array of translations
    res.json(finalTranslations);
  } catch (error) {
    console.error('Translation Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Translation failed' });
  }
});

// Books API Endpoint

/**
 * GET /api/books
 * Returns a paginated list of books with optional filters.
 * Query Parameters:
 * - seed: string (default: 'default')
 * - page: number (default: 1)
 * - region: string (e.g., 'en', 'fr', 'de') (default: 'en')
 * - likes: number (default: 0)
 * - reviews: number (default: 0)
 */
app.get('/api/books', (req, res) => {
  const {
    seed = 'default',
    page = 1,
    region = 'en',
    likes = '0',
    reviews = '0',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const avgLikes = Math.max(0, parseFloat(likes));
  const avgReviews = Math.max(0, parseFloat(reviews));

  const combinedSeed = `${seed}-${pageNum}`;
  const fakerLocale = getFakerLocale(region);

  // Set Faker locale and seed for deterministic data
  faker.locale = fakerLocale;
  faker.seed(hashCode(combinedSeed));

  console.log(`Locale set to: ${faker.locale}, Seed: ${combinedSeed}`); // Debug log

  const booksPerPage = 20;
  const books = [];

  for (let i = 0; i < booksPerPage; i++) {
    // Generate localized data
    const title = faker.book.title();
    const author = faker.person.fullName();
    const publisher = faker.company.name();
    const numLikes = fractionalValue(avgLikes);
    const numReviews = fractionalValue(avgReviews);

    const bookReviews = [];
    for (let r = 0; r < numReviews; r++) {
      bookReviews.push({
        author: faker.person.fullName(),
        text: faker.lorem.paragraph(),
      });
    }

    // Generate unique ISBN
    let isbn;
    try {
      isbn = faker.unique(() => faker.helpers.replaceSymbols('###-##########'), { maxRetries: 100 });
    } catch (error) {
      isbn = faker.helpers.replaceSymbols('###-##########');
    }

    // Generate a cover image URL based on ISBN
    const coverImageUrl = `https://picsum.photos/seed/${isbn}/200/300`;
    const index = i + 1 + (pageNum - 1) * booksPerPage;

    books.push({
      id: uuidv4(),
      index,
      isbn,
      title,
      author,
      publisher,
      likes: numLikes,
      reviews: bookReviews,
      coverImageUrl,
    });
  }

  res.json(books);
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

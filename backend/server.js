const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { faker } = require('@faker-js/faker');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

const translationCache = new NodeCache({ stdTTL: 86400, checkperiod: 20 });

app.use(cors());
app.use(express.json());

function getFakerLocale(region) {
  switch (region) {
    case 'en':
      return 'en_US';
    case 'fr':
      return 'fr';
    case 'de':
      return 'de';
    default:
      return 'en_US';
  }
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function fractionalValue(avg) {
  const intPart = Math.floor(avg);
  const fraction = avg - intPart;
  let val = intPart;
  if (Math.random() < fraction) {
    val++;
  }
  return val;
}

app.post('/api/translate', async (req, res) => {
  const { q, source, target } = req.body;

  if (!q || !source || !target) {
    return res.status(400).json({ error: 'Missing required fields: q, source, target' });
  }

  try {
    const isArray = Array.isArray(q);
    const textsToTranslate = isArray ? q : [q];

    const cacheKeys = textsToTranslate.map(text => `${source}-${target}-${text}`);
    const cachedTranslations = cacheKeys.map(key => translationCache.get(key));

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
      const translationPromises = textsToFetch.map(text =>
        axios.get('https://api.mymemory.translated.net/get', {
          params: {
            q: text,
            langpair: `${source}|${target}`,
          },
        })
      );

      const responses = await Promise.all(translationPromises);
      fetchedTranslations = responses.map(response => {
        if (response.data && response.data.responseData && response.data.responseData.translatedText) {
          return response.data.responseData.translatedText;
        } else {
          return text;
        }
      });

      fetchedTranslations.forEach((translatedText, idx) => {
        const cacheKey = cacheKeys[indexesToFetch[idx]];
        translationCache.set(cacheKey, translatedText);
      });
    }

    let finalTranslations = cachedTranslations.slice();

    indexesToFetch.forEach((idx, fetchIdx) => {
      finalTranslations[idx] = fetchedTranslations[fetchIdx];
    });

    if (!isArray) {
      return res.json({ translatedText: finalTranslations[0] });
    }

    res.json(finalTranslations);
  } catch (error) {
    res.status(500).json({ error: 'Translation failed' });
  }
});

app.get('/api/books', (req, res) => {
  const {
    seed = 'default',
    page = 1,
    region = 'en',
    likes = '0',
    reviews = '0',
  } = req.query;

  try {
    const pageNum = Math.max(1, parseInt(page, 10));
    const avgLikes = Math.max(0, parseFloat(likes));
    const avgReviews = Math.max(0, parseFloat(reviews));

    const combinedSeed = `${seed}-${pageNum}`;
    const fakerLocale = getFakerLocale(region);

    faker.locale = fakerLocale;
    faker.seed(hashCode(combinedSeed));

    const booksPerPage = 20;
    const books = [];

    for (let i = 0; i < booksPerPage; i++) {
      const title = faker.lorem.sentence();
      const author = faker.name.fullName();
      const publisher = faker.company.name();
      const numLikes = fractionalValue(avgLikes);
      const numReviews = fractionalValue(avgReviews);

      const bookReviews = [];
      for (let r = 0; r < numReviews; r++) {
        const reviewAuthor = faker.name.fullName();
        const reviewText = faker.lorem.paragraph();

        if (!reviewAuthor || !reviewText) {
          continue;
        }

        bookReviews.push({
          author: reviewAuthor,
          text: reviewText,
        });
      }

      const isbn = faker.helpers.replaceSymbols('###-##########') + `-${i + 1}`;

      const coverImageUrl = `https://picsum.photos/seed/${isbn}/200/300`;
      const index = i + 1 + (pageNum - 1) * booksPerPage;

      const safeTitle = title || 'Untitled';
      const safeAuthor = author || 'Unknown Author';
      const safePublisher = publisher || 'Unknown Publisher';

      books.push({
        id: uuidv4(),
        index,
        isbn,
        title: safeTitle,
        author: safeAuthor,
        publisher: safePublisher,
        likes: numLikes,
        reviews: bookReviews,
        coverImageUrl,
      });
    }

    res.json(books);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate books' });
  }
});

app.use(express.static(path.join(__dirname, '../frontend/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
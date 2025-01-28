// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import axios from 'axios';
import './i18n';
import { useTranslation } from 'react-i18next';

function App() {
  const { t, i18n } = useTranslation();

  const [region, setRegion] = useState('en');
  const [seed, setSeed] = useState('');
  const [likes, setLikes] = useState(0.0);
  const [reviews, setReviews] = useState(0.0);

  const [page, setPage] = useState(1);
  const [books, setBooks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const API_BASE = process.env.REACT_APP_API_BASE_URL || '/api';

  /**
   * Translate book data based on selected region
   * @param {Array} booksData
   * @returns {Array}
   */
  const translateBooks = async (booksData) => {
    if (region === 'en') return booksData;

    try {
      const translatedBooks = await Promise.all(
        booksData.map(async (book) => {
          const translatedTitle = await translateText(book.title);
          const translatedAuthor = await translateText(book.author);
          const translatedPublisher = await translateText(book.publisher);
          const translatedReviews = await Promise.all(
            book.reviews.map(async (review) => ({
              ...review,
              text: await translateText(review.text),
            }))
          );

          return {
            ...book,
            title: translatedTitle,
            author: translatedAuthor,
            publisher: translatedPublisher,
            reviews: translatedReviews,
          };
        })
      );
      return translatedBooks;
    } catch (error) {
      console.error('Error translating books:', error);
      return booksData;
    }
  };

  /**
   * Translate a single text
   * @param {string} text
   * @returns {string}
   */
  const translateText = async (text) => {
    try {
      const response = await axios.post(
        `${API_BASE}/translate`,
        {
          q: text,
          source: 'en',
          target: region,
        },
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      return response.data.translatedText || text;
    } catch (error) {
      console.error('Error translating text:', error);
      return text;
    }
  };

  /**
   * Generate a random seed
   * @returns {string}
   */
  const generateRandomSeed = () => {
    return Math.floor(Math.random() * 10000000).toString();
  };

  /**
   * Handle random seed generation
   */
  const handleRandomSeed = () => {
    const randomSeed = generateRandomSeed();
    setSeed(randomSeed);
    setPage(1);
    setBooks([]);
    setHasMore(true);
  };

  /**
   * Fetch books from the backend
   * @param {number} currentPage
   */
  const fetchBooks = async (currentPage) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        region,
        seed,
        likes: likes.toString(),
        reviews: reviews.toString(),
        page: currentPage.toString(),
      }).toString();

      const response = await fetch(`${API_BASE}/books?${params}`);
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();

      if (data.length === 0) {
        setHasMore(false);
      } else {
        const translatedBooks = await translateBooks(data);
        setBooks((prevBooks) => [...prevBooks, ...translatedBooks]);
      }
    } catch (error) {
      console.error('Error fetching books:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Effect to fetch books when dependencies change
   */
  useEffect(() => {
    fetchBooks(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, region, seed, likes, reviews]);

  /**
   * Handle infinite scrolling
   * @param {object} e
   */
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50) {
      if (!isLoading && hasMore) {
        setPage((prev) => prev + 1);
      }
    }
  };

  /**
   * Change language/region
   * @param {string} lng
   */
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    setRegion(lng);
    setPage(1);
    setBooks([]);
    setHasMore(true);
  };

  return (
    <div
      className="container my-4"
      onScroll={handleScroll}
      style={{ height: '80vh', overflowY: 'auto' }}
    >
      <h1 className="text-center mb-4">{t('title')}</h1>

      <div className="mb-4">
        <label htmlFor="language-select" className="form-label">
          {t('filters.language')}
        </label>
        <select
          id="language-select"
          className="form-select"
          value={region}
          onChange={(e) => changeLanguage(e.target.value)}
        >
          <option value="en">English (US)</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      <div className="row mb-4">
        <div className="col-md-3 mb-3">
          <label htmlFor="seed-input" className="form-label">
            {t('filters.seed')}
          </label>
          <div className="input-group">
            <input
              id="seed-input"
              type="text"
              className="form-control"
              value={seed}
              onChange={(e) => {
                const newSeed = e.target.value;
                setSeed(newSeed);
                setPage(1);
                setBooks([]);
                setHasMore(true);
              }}
              placeholder={t('filters.enter_seed')}
            />
            <button
              className="btn btn-outline-secondary"
              onClick={handleRandomSeed}
              aria-label="Generate Random Seed"
              title={t('filters.random_seed')}
            >
              🔀
            </button>
          </div>
        </div>

        <div className="col-md-3 mb-3">
          <label htmlFor="likes-slider" className="form-label">
            {`${t('filters.likes')}: ${likes}`}
          </label>
          <input
            id="likes-slider"
            type="range"
            className="form-range"
            min="0"
            max="10"
            step="0.1"
            value={likes}
            onChange={(e) => {
              setLikes(parseFloat(e.target.value));
              setPage(1);
              setBooks([]);
              setHasMore(true);
            }}
          />
        </div>

        <div className="col-md-3 mb-3">
          <label htmlFor="reviews-input" className="form-label">
            {t('filters.reviews')}
          </label>
          <input
            id="reviews-input"
            type="number"
            className="form-control"
            step="0.1"
            value={reviews}
            onChange={(e) => {
              const reviewValue = parseFloat(e.target.value) || 0;
              setReviews(reviewValue);
              setPage(1);
              setBooks([]);
              setHasMore(true);
            }}
            placeholder={t('filters.enter_reviews')}
          />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-striped table-hover align-middle">
          <thead className="table-dark">
            <tr>
              <th>{t('table.number')}</th>
              <th>{t('table.isbn')}</th>
              <th>{t('table.title')}</th>
              <th>{t('table.authors')}</th>
              <th>{t('table.publisher')}</th>
              <th>{t('table.likes')}</th>
              <th>{t('table.review_count')}</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book, index) => (
              <BookRow key={book.id} book={book} index={index + 1} />
            ))}
          </tbody>
        </table>
      </div>

      {isLoading && (
        <div className="text-center my-3">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{t('loading')}</span>
          </div>
        </div>
      )}

      {!hasMore && !isLoading && (
        <div className="alert alert-info text-center" role="alert">
          {t('no_more_books')}
        </div>
      )}
    </div>
  );
}

/**
 * BookRow Component
 * @param {object} props
 * @returns JSX.Element
 */
function BookRow({ book, index }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className={isExpanded ? 'table-active' : ''}
        style={{ cursor: 'pointer' }}
      >
        <th scope="row">{index}</th>
        <td>{book.isbn}</td>
        <td>{book.title}</td>
        <td>{book.author}</td>
        <td>{book.publisher}</td>
        <td>{book.likes}</td>
        <td>{book.reviews.length}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan="7">
            <div className="card my-3">
              <div className="row g-0">
                <div className="col-md-4">
                  <img
                    src={book.coverImageUrl}
                    className="img-fluid rounded-start"
                    alt={t('table.title')}
                  />
                </div>
                <div className="col-md-8">
                  <div className="card-body">
                    <h5 className="card-title">{book.title}</h5>
                    <p className="card-text">
                      <strong>{t('table.authors')}:</strong> {book.author}
                    </p>
                    <p className="card-text">
                      <strong>{t('table.publisher')}:</strong> {book.publisher}
                    </p>
                    <h6 className="card-title">{t('filters.reviews')}</h6>
                    {book.reviews.length > 0 ? (
                      book.reviews.map((review, idx) => (
                        <div key={idx} className="mb-3">
                          <p>
                            <strong>{review.author}</strong>:
                          </p>
                          <p>{review.text}</p>
                        </div>
                      ))
                    ) : (
                      <p>{t('no_reviews')}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default App;

/**
 * Search History & User Interaction Tracking Utilities
 * Manages localStorage for search history, viewed products, and recommendations seeding
 */

const SEARCH_HISTORY_KEY = 'flexcart_search_history';
const VIEWED_PRODUCTS_KEY = 'flexcart_viewed_products';
const FAVORITED_PRODUCTS_KEY = 'flexcart_favorited_products';
const REQUESTED_PRODUCTS_KEY = 'flexcart_requested_products';
const MAX_HISTORY_ITEMS = 20;
const MAX_RECENT_INTERACTIONS = 30;

const INTERACTION_EVENT_NAME = 'flexcart:interaction';

const notifyInteractionChange = () => {
  // Keep it best-effort: if window isn't available (tests/SSR), do nothing.
  try {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    window.dispatchEvent(new Event(INTERACTION_EVENT_NAME));
  } catch (_) {
  }
};

/**
 * Add a search query to history
 */
export const addSearchHistory = (query) => {
  if (!query || typeof query !== 'string' || query.trim().length === 0) return;

  const trimmedQuery = query.trim();
  let history = getSearchHistory();

  // Remove duplicate if exists
  history = history.filter(item => item.query.toLowerCase() !== trimmedQuery.toLowerCase());

  // Add to front
  history.unshift({
    query: trimmedQuery,
    timestamp: Date.now()
  });

  // Keep only recent items
  history = history.slice(0, MAX_HISTORY_ITEMS);

  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
};

/**
 * Get all search history
 */
export const getSearchHistory = () => {
  try {
    const history = localStorage.getItem(SEARCH_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.warn('Error reading search history:', error);
    return [];
  }
};

/**
 * Remove specific search query from history
 */
export const removeFromSearchHistory = (query) => {
  const history = getSearchHistory();
  const filtered = history.filter(item => item.query.toLowerCase() !== query.toLowerCase());
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
};

/**
 * Clear all search history
 */
export const clearSearchHistory = () => {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
};

/**
 * Track viewed product
 */
export const addViewedProduct = (productId) => {
  if (!productId) return;

  let viewed = getViewedProducts();

  // Remove if already exists
  viewed = viewed.filter(item => item.id !== productId);

  // Add to front
  viewed.unshift({
    id: productId,
    timestamp: Date.now()
  });

  // Keep recent
  viewed = viewed.slice(0, MAX_RECENT_INTERACTIONS);
  localStorage.setItem(VIEWED_PRODUCTS_KEY, JSON.stringify(viewed));
  notifyInteractionChange();
};

/**
 * Get viewed products (ordered by recency)
 */
export const getViewedProducts = () => {
  try {
    const viewed = localStorage.getItem(VIEWED_PRODUCTS_KEY);
    return viewed ? JSON.parse(viewed) : [];
  } catch (error) {
    console.warn('Error reading viewed products:', error);
    return [];
  }
};

/**
 * Track favorited product
 */
export const addFavoritedProduct = (productId) => {
  if (!productId) return;

  let favorited = getFavoritedProducts();

  // Remove if already exists (we're tracking favorites)
  const exists = favorited.find(item => item.id === productId);
  if (exists) return; // Don't re-add

  favorited.unshift({
    id: productId,
    timestamp: Date.now()
  });

  favorited = favorited.slice(0, MAX_RECENT_INTERACTIONS);
  localStorage.setItem(FAVORITED_PRODUCTS_KEY, JSON.stringify(favorited));
  notifyInteractionChange();
};

/**
 * Get favorited products
 */
export const getFavoritedProducts = () => {
  try {
    const favorited = localStorage.getItem(FAVORITED_PRODUCTS_KEY);
    return favorited ? JSON.parse(favorited) : [];
  } catch (error) {
    console.warn('Error reading favorited products:', error);
    return [];
  }
};

/**
 * Remove from favorited products
 */
export const removeFavoritedProduct = (productId) => {
  const favorited = getFavoritedProducts();
  const filtered = favorited.filter(item => item.id !== productId);
  localStorage.setItem(FAVORITED_PRODUCTS_KEY, JSON.stringify(filtered));
  notifyInteractionChange();
};

/**
 * Track requested product
 */
export const addRequestedProduct = (productId) => {
  if (!productId) return;

  let requested = getRequestedProducts();

  // Remove if already exists
  requested = requested.filter(item => item.id !== productId);

  requested.unshift({
    id: productId,
    timestamp: Date.now()
  });

  requested = requested.slice(0, MAX_RECENT_INTERACTIONS);
  localStorage.setItem(REQUESTED_PRODUCTS_KEY, JSON.stringify(requested));
  notifyInteractionChange();
};

/**
 * Get requested products
 */
export const getRequestedProducts = () => {
  try {
    const requested = localStorage.getItem(REQUESTED_PRODUCTS_KEY);
    return requested ? JSON.parse(requested) : [];
  } catch (error) {
    console.warn('Error reading requested products:', error);
    return [];
  }
};

/**
 * Get most recent product interaction (across all types)
 * Order: searched > viewed > favorited > requested
 */
export const getMostRecentProductId = (searchQuery) => {
  if (searchQuery) {
    // If there's an active search, don't use interaction history
    return null;
  }

  const viewed = getViewedProducts();
  const favorited = getFavoritedProducts();
  const requested = getRequestedProducts();

  // Combine with type identifier for sorting
  const allInteractions = [
    ...viewed.map(v => ({ id: v.id, type: 'viewed', timestamp: v.timestamp })),
    ...favorited.map(f => ({ id: f.id, type: 'favorited', timestamp: f.timestamp })),
    ...requested.map(r => ({ id: r.id, type: 'requested', timestamp: r.timestamp }))
  ];

  if (allInteractions.length === 0) return null;

  // Sort by timestamp (most recent first)
  allInteractions.sort((a, b) => b.timestamp - a.timestamp);

  // Return the most recent product ID
  return allInteractions[0].id;
};

/**
 * Clear all interaction history (for logout or user request)
 */
export const clearAllInteractionHistory = () => {
  localStorage.removeItem(VIEWED_PRODUCTS_KEY);
  localStorage.removeItem(FAVORITED_PRODUCTS_KEY);
  localStorage.removeItem(REQUESTED_PRODUCTS_KEY);
};

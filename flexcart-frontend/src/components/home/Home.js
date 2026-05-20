import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { motion } from 'framer-motion';
import ProductCard from './ProductCard';
import ProductDetail from './ProductDetail';
import LoadingSpinner from '../common/LoadingSpinner';
import AdBanner from '../common/AdBanner';
import BuyNowModal from '../cart/BuyNowModal';
import productService from '../../services/productService';
import { CartContext } from '../../context/CartContext';
import { AuthContext } from '../../context/AuthContext';
import { CompanyContext } from '../../context/CompanyContext';
import { NavigationContext } from '../../context/NavigationContext';
import { addSearchHistory, getMostRecentProductId } from '../../utils/searchHistory';
import { toast } from 'react-toastify';
import { Package, ShoppingCart } from 'lucide-react';
import './Home.css';

const INTERACTION_EVENT_NAME = 'flexcart:interaction';

const Home = ({ category, sort, filters, onRequireAuth, showRecommendations }) => {
  const { addToCart } = useContext(CartContext);
  const { isAuthenticated, user } = useContext(AuthContext);
  const { myCompanies } = useContext(CompanyContext);
  const { pendingProductId, setPendingProductId, aiSearchResults, setAiSearchResults } = useContext(NavigationContext);

  // Build a Set of company IDs the logged-in user owns so we can block self-purchase
  const ownedCompanyIds = useMemo(() => {
    return new Set((myCompanies || []).map((company) => Number(company.id)));
  }, [myCompanies]);

  const isOwnProduct = useCallback((product) => {
    const ownerId = Number(product?.company_owner_id);
    if (user?.id && Number.isFinite(ownerId) && ownerId) {
      return Number(user.id) === ownerId;
    }

    const companyId = Number(product?.company_id);
    if (Number.isFinite(companyId) && companyId) {
      return ownedCompanyIds.has(companyId);
    }

    return false;
  }, [ownedCompanyIds, user?.id]);
  const [products, setProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [interactionTick, setInteractionTick] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [buyNowProduct, setBuyNowProduct] = useState(null);

  const searchSeedId = useMemo(() => {
    const activeSearch = filters?.search || null;
    if (!activeSearch) return null;
    if (!Array.isArray(products) || products.length === 0) return null;
    return products[0]?.id || null;
  }, [filters?.search, products]);

  // Drag to cart state
  const [draggingProduct, setDraggingProduct] = useState(null);
  const [showDragCart, setShowDragCart] = useState(false);

  const observerRef = useRef(null);
  const loadMoreRef = useRef(null);

  const loadProducts = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const params = {
        page: pageNum,
        limit: 20,
        sort: sort || 'newest',
        ...filters
      };

      if (category) params.category = category;

      const response = await productService.getProducts(params);

      if (response.data.success) {
        const newProducts = response.data.data.products;
        setProducts(prev => append ? [...prev, ...newProducts] : newProducts);
        setHasMore(response.data.data.pagination.hasMore);
      }
    } catch (error) {
      console.error('Load products error:', error);
      setHasMore(false); // stop infinite scroll on any error
      if (pageNum === 1) toast.error('Failed to load products');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, sort, filters]);

  // Reset on filter changes
  useEffect(() => {
    const aiMode = Boolean(filters?.ai);

    if (aiMode) {
      const merged = [
        ...(aiSearchResults?.inStock || []),
        ...(aiSearchResults?.outOfStock || [])
      ];
      setProducts(merged);
      setHasMore(false);
      setPage(1);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (aiSearchResults) {
      setAiSearchResults(null);
    }

    setPage(1);
    loadProducts(1, false);
  }, [loadProducts, filters?.ai, aiSearchResults, setAiSearchResults]);

  // Open product directly when triggered from SearchBar
  useEffect(() => {
    if (!pendingProductId) return;
    const open = async () => {
      try {
        const res = await productService.getProductById(pendingProductId);
        if (res.data.success) {
          setSelectedProduct(res.data.data);
        }
      } catch (e) {
        console.error('Failed to load product from search', e);
      } finally {
        setPendingProductId(null);
      }
    };
    open();
  }, [pendingProductId, setPendingProductId]);

  useEffect(() => {
    const handleInteraction = () => setInteractionTick((tick) => tick + 1);
    window.addEventListener(INTERACTION_EVENT_NAME, handleInteraction);
    return () => window.removeEventListener(INTERACTION_EVENT_NAME, handleInteraction);
  }, []);

  useEffect(() => {
    const loadRecommendations = async () => {
      if (!isAuthenticated || !showRecommendations) {
        setRecommendations([]);
        return;
      }

      try {
        setLoadingRecommendations(true);
        const searchQuery = filters?.search || null;
        let seedProductId = null;

        // Track search if active
        if (searchQuery) {
          addSearchHistory(searchQuery);

          // Prefer the first product already displayed for this search as seed
          if (searchSeedId) seedProductId = searchSeedId;

          try {
            if (!seedProductId) {
              const searchResponse = await productService.searchProducts(searchQuery);
              if (searchResponse.data.success) {
                const found = searchResponse.data.data?.products || searchResponse.data.data || [];
                if (Array.isArray(found) && found.length > 0 && found[0].id) {
                  seedProductId = found[0].id;
                }
              }
            }
          } catch (searchError) {
            console.warn('Could not extract seed product from search:', searchError);
          }
        } else {
          // If no active search, get most recent product from user interactions
          seedProductId = getMostRecentProductId(null);
        }

        const params = { limit: 8 };
        if (seedProductId) {
          params.seed_product_id = seedProductId;
        }

        const response = await productService.getHybridRecommendations(params);
        if (response.data.success) {
          setRecommendations(response.data.data.recommendations || []);
        }
      } catch (error) {
        console.error('Load recommendations error:', error);
      } finally {
        setLoadingRecommendations(false);
      }
    };

    loadRecommendations();
  }, [isAuthenticated, showRecommendations, filters, searchSeedId, interactionTick]);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (filters?.ai) return;
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadProducts(nextPage, true);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    observerRef.current = observer;

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loadingMore, page, loadProducts, filters?.ai]);

  const handleAddToCart = async (productId) => {
    if (!isAuthenticated) { onRequireAuth(); return; }
    const result = await addToCart(productId);
    if (result.success) toast.success('Added to cart!');
    else toast.error(result.message);
  };

  const handleBuyNow = (product) => {
    if (!isAuthenticated) { onRequireAuth(); return; }
    setBuyNowProduct(product);
  };

  // Long press drag to cart
  const handleLongPressStart = (product) => {
    setDraggingProduct(product);
    setShowDragCart(true);
  };

  const handleDragEnd = (productId) => {
    if (showDragCart) {
      handleAddToCart(productId);
    }
    setDraggingProduct(null);
    setShowDragCart(false);
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="home-container">
      {/* Ad Banner — displays active promotions from super admin */}
      <AdBanner />

      {isAuthenticated && showRecommendations && (
        <div className="home-recommendations">
          <div className="home-section-title">Recommended for You</div>

          {loadingRecommendations && (
            <div className="load-more-trigger">
              <LoadingSpinner size={30} />
            </div>
          )}

          {!loadingRecommendations && recommendations.length > 0 && (
            <div className="products-grid recommended-grid">
              {recommendations.map((product, index) => (
                <motion.div
                  key={`rec-${product.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.35 }}
                >
                  <ProductCard
                    product={product}
                    onAddToCart={() => handleAddToCart(product.id)}
                    onBuyNow={() => handleBuyNow(product)}
                    onViewDetail={() => setSelectedProduct(product)}
                    onLongPressStart={() => handleLongPressStart(product)}
                    onDragEnd={() => handleDragEnd(product.id)}
                    onRequireAuth={onRequireAuth}
                    isOwnProduct={isOwnProduct(product)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="products-grid">
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.4 }}
          >
            <ProductCard
              product={product}
              onAddToCart={() => handleAddToCart(product.id)}
              onBuyNow={() => handleBuyNow(product)}
              onViewDetail={() => setSelectedProduct(product)}
              onLongPressStart={() => handleLongPressStart(product)}
              onDragEnd={() => handleDragEnd(product.id)}
              onRequireAuth={onRequireAuth}
              isOwnProduct={isOwnProduct(product)}
            />
          </motion.div>
        ))}
      </div>

      {products.length === 0 && !loading && (
        <div className="no-products">
          <Package size={48} className="no-products-icon" />
          <h3>No products found</h3>
          <p>Try adjusting your filters or search criteria</p>
        </div>
      )}

      {/* Infinite scroll loader */}
      <div ref={loadMoreRef} className="load-more-trigger">
        {loadingMore && <LoadingSpinner size={30} />}
        {!hasMore && products.length > 0 && (
          <p className="end-of-list">You've seen all products!</p>
        )}
      </div>

      {/* Drag-to-cart overlay */}
      {showDragCart && (
        <motion.div
          className="drag-cart-zone"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
        >
          <ShoppingCart size={32} className="drag-cart-icon" />
          <span>{draggingProduct ? `Add "${draggingProduct.name}" to cart` : 'Drop to add to cart'}</span>
        </motion.div>
      )}

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={() => handleAddToCart(selectedProduct.id)}
          onRequireAuth={onRequireAuth}
        />
      )}

      {/* Buy Now Modal */}
      {buyNowProduct && (
        <BuyNowModal
          product={buyNowProduct}
          onClose={() => setBuyNowProduct(null)}
          onSuccess={() => setBuyNowProduct(null)}
        />
      )}
    </div>
  );
};

export default Home;
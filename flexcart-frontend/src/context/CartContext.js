import React, { createContext, useState, useEffect, useCallback, useContext } from 'react';
import { AuthContext } from './AuthContext';
import api from '../services/api';

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const { isAuthenticated, user } = useContext(AuthContext);
  const userId = user?.id ?? null;
  const [cartItems, setCartItems] = useState([]);
  const [cartTotal, setCartTotal] = useState(0);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!isAuthenticated) {
      setCartItems([]);
      setCartTotal(0);
      setCartCount(0);
      return;
    }

    try {
      setLoading(true);
      const response = await api.get('/cart');
      if (response.data.success) {
        setCartItems(response.data.data.items);
        setCartTotal(response.data.data.cartTotal);
        setCartCount(response.data.data.totalItems);
      }
    } catch (error) {
      console.error('Fetch cart error:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  // Re-fetch when the logged-in user changes (account switch)
  useEffect(() => {
    if (isAuthenticated && userId) {
      fetchCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const addToCart = async (productId, quantity = 1, negotiatedPrice = null) => {
    try {
      const body = { product_id: productId, quantity };
      if (negotiatedPrice) body.negotiated_price = negotiatedPrice;
      const response = await api.post('/cart', body);
      if (response.data.success) {
        await fetchCart();
        return { success: true };
      }
      return { success: false, message: response.data.message };
    } catch (error) {
      return { success: false, message: error.response?.data?.message || 'Failed to add to cart' };
    }
  };

  const updateQuantity = async (cartItemId, quantity) => {
    try {
      await api.put(`/cart/${cartItemId}`, { quantity });
      await fetchCart();
    } catch (error) {
      console.error('Update quantity error:', error);
    }
  };

  const removeItem = async (cartItemId) => {
    try {
      await api.delete(`/cart/${cartItemId}`);
      await fetchCart();
    } catch (error) {
      console.error('Remove item error:', error);
    }
  };

  const clearCart = async () => {
    try {
      await api.delete('/cart');
      setCartItems([]);
      setCartTotal(0);
      setCartCount(0);
    } catch (error) {
      console.error('Clear cart error:', error);
    }
  };

  return (
    <CartContext.Provider value={{
      cartItems,
      cartTotal,
      cartCount,
      loading,
      addToCart,
      updateQuantity,
      removeItem,
      clearCart,
      fetchCart
    }}>
      {children}
    </CartContext.Provider>
  );
};
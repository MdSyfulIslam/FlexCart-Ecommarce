import React, { createContext, useState, useEffect, useContext } from 'react';
import { AuthContext } from './AuthContext';
import api from '../services/api';

export const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const { user, isAuthenticated } = useContext(AuthContext);
  const [theme, setTheme] = useState('light');
  const [appearanceColor, setAppearanceColor] = useState('#4F46E5');
  const [backgroundImage, setBackgroundImage] = useState(null);

  useEffect(() => {
    if (user) {
      setTheme(user.theme || 'light');
      setAppearanceColor(user.appearance_color || '#4F46E5');
      setBackgroundImage(user.background_image || localStorage.getItem('flexcart_background') || null);
    } else {
      // Load from localStorage for guests
      var savedTheme = localStorage.getItem('flexcart_theme') || 'light';
      var savedBg = localStorage.getItem('flexcart_background') || null;
      var savedColor = localStorage.getItem('flexcart_appearance_color') || '#4F46E5';
      setTheme(savedTheme);
      setBackgroundImage(savedBg);
      setAppearanceColor(savedColor);
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('flexcart_theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary', appearanceColor);
    var adjustHex = function (hex, percent) {
      if (!hex) return '#000000';
      var normalized = String(hex).trim();
      if (normalized[0] !== '#') normalized = '#' + normalized;
      if (normalized.length === 4) {
        normalized = '#' + normalized[1] + normalized[1] + normalized[2] + normalized[2] + normalized[3] + normalized[3];
      }
      if (normalized.length !== 7) return '#000000';

      var num = parseInt(normalized.slice(1), 16);
      if (Number.isNaN(num)) return '#000000';

      var amt = Math.round(255 * (percent / 100));
      var clampByte = function (n) { return Math.max(0, Math.min(255, n)); };

      var r = clampByte((num >> 16) + amt);
      var g = clampByte(((num >> 8) & 0x00FF) + amt);
      var b = clampByte((num & 0x0000FF) + amt);

      return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };
    document.documentElement.style.setProperty('--primary-light', adjustHex(appearanceColor, 30));
    document.documentElement.style.setProperty('--primary-dark', adjustHex(appearanceColor, -20));
    localStorage.setItem('flexcart_appearance_color', appearanceColor);
  }, [appearanceColor]);

  // Save background to localStorage whenever it changes
  useEffect(() => {
    if (backgroundImage) {
      localStorage.setItem('flexcart_background', backgroundImage);
    } else {
      localStorage.removeItem('flexcart_background');
    }
  }, [backgroundImage]);

  var toggleTheme = function () {
    var newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    if (isAuthenticated) {
      api.put('/settings/theme', { theme: newTheme }).catch(function (error) {
        console.error('Error saving theme:', error);
      });
    }
  };

  var changeAppearanceColor = function (color) {
    setAppearanceColor(color);
    if (isAuthenticated) {
      api.put('/settings/appearance-color', { color: color }).catch(function (error) {
        console.error('Error saving appearance:', error);
      });
    }
  };

  var changeBackground = function (bg) {
    console.log('changeBackground called with:', bg);
    setBackgroundImage(bg);
    // Save to localStorage immediately (works for both guests and users)
    if (bg) {
      localStorage.setItem('flexcart_background', bg);
    } else {
      localStorage.removeItem('flexcart_background');
    }
    // Also save to server if authenticated
    if (isAuthenticated) {
      api.put('/settings/background', { background_image: bg }).catch(function (error) {
        console.error('Error saving background:', error);
        // Don't revert - keep the local state
      });
    }
  };

  return (
    <ThemeContext.Provider value={{
      theme: theme,
      appearanceColor: appearanceColor,
      backgroundImage: backgroundImage,
      toggleTheme: toggleTheme,
      setTheme: function (t) {
        setTheme(t);
        if (isAuthenticated) {
          api.put('/settings/theme', { theme: t }).catch(console.error);
        }
      },
      changeAppearanceColor: changeAppearanceColor,
      changeBackground: changeBackground
    }}>
      {children}
    </ThemeContext.Provider>
  );
};
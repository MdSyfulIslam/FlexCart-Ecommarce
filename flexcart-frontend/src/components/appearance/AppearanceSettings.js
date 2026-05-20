import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { FiSun, FiMoon, FiCheck } from 'react-icons/fi';
import { ThemeContext } from '../../context/ThemeContext';
import { APPEARANCE_COLORS } from '../../utils/constants';
import './AppearanceSettings.css';

const AppearanceSettings = ({ onClose }) => {
  const { theme, appearanceColor, toggleTheme, changeAppearanceColor } = useContext(ThemeContext);

  const handleColorChange = (color) => {
    changeAppearanceColor(color);
    // Do NOT close or show toast - stay on this modal
  };

  const handleThemeChange = (newTheme) => {
    if (theme !== newTheme) {
      toggleTheme();
    }
  };

  return (
    <div className="appearance-settings">
      {/* Theme Selection */}
      <div className="as-section">
        <h3 className="as-section-title">Theme</h3>
        <div className="as-theme-options">
          <motion.button
            className={`as-theme-card ${theme === 'light' ? 'active' : ''}`}
            onClick={() => handleThemeChange('light')}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="as-theme-preview light-preview">
              <div className="tp-header" />
              <div className="tp-sidebar" />
              <div className="tp-content">
                <div className="tp-card" />
                <div className="tp-card" />
              </div>
            </div>
            <div className="as-theme-info">
              <FiSun size={16} />
              <span>Light</span>
              {theme === 'light' && <FiCheck size={16} className="as-check" />}
            </div>
          </motion.button>

          <motion.button
            className={`as-theme-card ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => handleThemeChange('dark')}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className="as-theme-preview dark-preview">
              <div className="tp-header" />
              <div className="tp-sidebar" />
              <div className="tp-content">
                <div className="tp-card" />
                <div className="tp-card" />
              </div>
            </div>
            <div className="as-theme-info">
              <FiMoon size={16} />
              <span>Dark</span>
              {theme === 'dark' && <FiCheck size={16} className="as-check" />}
            </div>
          </motion.button>
        </div>
      </div>

      {/* Accent Color Selection */}
      <div className="as-section">
        <h3 className="as-section-title">Accent Color</h3>
        <p className="as-section-desc">Choose a color to customize buttons, links, and highlights</p>
        <div className="as-color-grid">
          {APPEARANCE_COLORS.map((color) => (
            <motion.button
              key={color}
              className={`as-color-btn ${appearanceColor === color ? 'active' : ''}`}
              style={{ background: color }}
              onClick={() => handleColorChange(color)}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              title={color}
            >
              {appearanceColor === color && <FiCheck size={16} color="white" />}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Info text */}
      <p className="as-hint">Changes are applied instantly. Close this panel when you're done.</p>
    </div>
  );
};

export default AppearanceSettings;
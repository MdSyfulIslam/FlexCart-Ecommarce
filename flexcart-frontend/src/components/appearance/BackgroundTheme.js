import React, { useContext } from 'react';
import { motion } from 'framer-motion';
import { FiCheck, FiX, FiImage } from 'react-icons/fi';
import { ThemeContext } from '../../context/ThemeContext';
import './BackgroundTheme.css';

const THEMES = [
  { id: 'ocean', name: 'Ocean Wave', type: '3d', category: 'nature', description: 'Deep ocean with flowing waves and bubbles' },
  { id: 'starry', name: 'Starry Night', type: '3d', category: 'space', description: 'Twinkling stars with shooting stars' },
  { id: 'forest', name: 'Forest Rain', type: '3d', category: 'nature', description: 'Gentle rain falling through forest' },
  { id: 'city', name: 'City Lights', type: '3d', category: 'urban', description: 'Pulsing neon city lights' },
  { id: 'sunset', name: 'Sunset Glow', type: '2d', category: 'gradient', description: 'Warm sunset with drifting clouds' },
  { id: 'snow', name: 'Snow Fall', type: '3d', category: 'weather', description: 'Peaceful snowflakes falling gently' },
  { id: 'abstract', name: 'Abstract Flow', type: '3d', category: 'abstract', description: 'Flowing color blobs in the dark' },
  { id: 'mountain', name: 'Mountain Mist', type: '3d', category: 'nature', description: 'Misty mountains with flying birds' },
  { id: 'minimal', name: 'Minimal Pulse', type: '2d', category: 'minimal', description: 'Clean subtle pulsing lines' },
  { id: 'darkmesh', name: 'Dark Mesh', type: '3d', category: 'dark', description: 'Dark gradient mesh with particles' },
];

const PREVIEW_GRADIENTS = [
  'linear-gradient(135deg, #0077B6, #00B4D8)',
  'linear-gradient(135deg, #0a0a23, #16213e, #1a1a3e)',
  'linear-gradient(135deg, #1B4332, #2D6A4F, #40916C)',
  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'linear-gradient(135deg, #ff6b35, #f7c59f)',
  'linear-gradient(135deg, #a8dadc, #457b9d, #1d3557)',
  'linear-gradient(135deg, #0a0a1a, #1a0a2e, #0a1a2e)',
  'linear-gradient(135deg, #606c38, #283618)',
  'linear-gradient(135deg, #f1faee, #e9ecef, #dee2e6)',
  'linear-gradient(135deg, #0a0a0f, #1a1a2e, #0f0f1a)',
];

const TYPE_COLORS = {
  '3d': '#8B5CF6',
  '2d': '#3B82F6',
};

const BackgroundTheme = ({ onClose }) => {
  const { backgroundImage, changeBackground } = useContext(ThemeContext);

  const handleSelectTheme = (theme) => {
    changeBackground(theme.id);
  };

  const handleRemove = () => {
    changeBackground(null);
  };

  return (
    <div className="background-theme">
      {/* Current Status */}
      <div className="bt-current">
        <div className="bt-current-info">
          <FiImage size={18} />
          <span>
            {backgroundImage
              ? `Active: ${THEMES.find(t => t.id === backgroundImage)?.name || backgroundImage}`
              : 'No background set'
            }
          </span>
        </div>
        {backgroundImage && (
          <button className="bt-remove-btn" onClick={handleRemove}>
            <FiX size={14} /> Remove
          </button>
        )}
      </div>

      {/* Themes Grid */}
      <div className="bt-section">
        <h3 className="bt-section-title">Choose a Background</h3>
        <div className="bt-grid">
          {THEMES.map((theme, index) => {
            const isSelected = backgroundImage === theme.id;

            return (
              <motion.button
                key={theme.id}
                className={`bt-theme-card ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelectTheme(theme)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <div
                  className="bt-preview"
                  style={{ background: PREVIEW_GRADIENTS[index] }}
                >
                  {isSelected && (
                    <motion.div className="bt-check" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <FiCheck size={18} />
                    </motion.div>
                  )}
                  <span
                    className="bt-type-badge"
                    style={{ background: TYPE_COLORS[theme.type] || '#64748B' }}
                  >
                    {theme.type.toUpperCase()}
                  </span>
                </div>
                <div className="bt-theme-info">
                  <span className="bt-theme-name">{theme.name}</span>
                  <span className="bt-theme-desc">{theme.description}</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <p className="bt-hint">Click a theme to apply it. Close this panel when you're done.</p>
    </div>
  );
};

export default BackgroundTheme;
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import './Modal.css';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  showClose = true,
  closePosition = 'right',
  headerLeft = null,
  headerRight = null
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle overlay click - only close if clicking the overlay itself
  const handleOverlayClick = (e) => {
    // Only close if the click target IS the overlay (not a child)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleOverlayClick}
          onMouseDown={(e) => {
            // Prevent mousedown on overlay from affecting children
            if (e.target !== e.currentTarget) {
              e.stopPropagation();
            }
          }}
        >
          <motion.div
            className={`modal-content modal-${size}`}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {(title || showClose || headerLeft || headerRight) && (
              <div className="modal-header">
                <div className="modal-header-zone modal-header-zone--left">
                  {showClose && closePosition === 'left' && (
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                      <FiX size={20} />
                    </button>
                  )}
                  {headerLeft}
                </div>

                <div className="modal-header-zone modal-header-zone--center">
                  {title && <h2 className="modal-title">{title}</h2>}
                </div>

                <div className="modal-header-zone modal-header-zone--right">
                  {headerRight}
                  {showClose && closePosition !== 'left' && (
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                      <FiX size={20} />
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};

export default Modal;
import React, { useState, useRef, useContext } from "react";
import { motion } from "framer-motion";
import { FiUploadCloud, FiSend, FiX } from "react-icons/fi";
import aiService from "../../services/aiService";
import { toast } from "react-toastify";
import { NavigationContext } from "../../context/NavigationContext";
import "./AIProcess.css";

const AIProcess = ({ onClose }) => {
  const { navigate, setAiSearchResults } = useContext(NavigationContext);

  const [dragOver, setDragOver] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      handleImageSelect(file);
    } else {
      toast.error("Please drop an image file");
    }
  };

  const handleImageSelect = (file) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      handleImageSelect(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedImage && !description.trim()) {
      toast.error("Please upload an image or enter a description");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      if (selectedImage) formData.append("image", selectedImage);
      if (description.trim())
        formData.append("description", description.trim());

      const response = await aiService.processImage(formData);
      if (response.data.success) {
        const payload = response.data.data;
        setAiSearchResults(payload);
        navigate("home", { ai: true });
        if (typeof onClose === "function") onClose();
        if (payload.totalResults === 0) toast.info("No matching products found.");
      }
    } catch (error) {
      toast.error("AI processing failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="ai-panel-head">
        <div className="ai-panel-head-left">
          <div className="ai-panel-badge">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M10 2L12.5 8.5L19 11L12.5 13.5L10 20L7.5 13.5L1 11L7.5 8.5L10 2Z"
                fill="white"
                opacity="0.95"
              />
              <path
                d="M18 1L19 4L22 5L19 6L18 9L17 6L14 5L17 4L18 1Z"
                fill="white"
                opacity="0.7"
              />
              <path
                d="M19 16L20 18.5L22.5 19.5L20 20.5L19 23L18 20.5L15.5 19.5L18 18.5L19 16Z"
                fill="white"
                opacity="0.5"
              />
            </svg>
          </div>
          <div>
            <h3 className="ai-panel-title">AI Product Search</h3>
            <p className="ai-panel-subtitle">Upload an image to find similar products</p>
          </div>
        </div>

        <button className="ai-panel-x" onClick={onClose}>
          <FiX size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="ai-panel-content">
        {/* Upload Area */}
        <div
          className={`ai-upload ${dragOver ? "dragging" : ""} ${imagePreview ? "has-image" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            hidden
          />
          {imagePreview ? (
            <div className="ai-upload-preview">
              <img src={imagePreview} alt="Selected" />
              <button
                className="ai-upload-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedImage(null);
                  setImagePreview(null);
                }}
              >
                <FiX size={12} />
              </button>
            </div>
          ) : (
            <div className="ai-upload-empty">
              <div className="ai-upload-icon-wrap">
                <FiUploadCloud size={24} />
              </div>
              <p className="ai-upload-text">Drag & drop image or click to upload</p>
              <span className="ai-upload-hint">PNG, JPG up to 5MB</span>
            </div>
          )}
        </div>

        {/* Input Row */}
        <div className="ai-input-row">
          <input
            type="text"
            className="ai-text-input"
            placeholder="Describe the product (optional)..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
          />
          <motion.button
            className="ai-submit-btn"
            onClick={handleSubmit}
            disabled={loading || (!selectedImage && !description.trim())}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {loading ? (
              <motion.div
                className="ai-btn-spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            ) : (
              <FiSend size={15} />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
};

export default AIProcess;

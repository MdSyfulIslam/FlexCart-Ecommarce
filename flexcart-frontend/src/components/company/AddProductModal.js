import React, { useState, useContext, useRef } from 'react';
import { CompanyContext } from '../../context/CompanyContext';
import { Upload, X, Package, Target, Star } from 'lucide-react';
import { isValidPrice, isValidQuantity, isValidUrl, isValidPercentage } from '../../utils/validators';
import './AddProductModal.css';

const AddProductModal = ({ companyId, categories, onClose, onProductAdded }) => {
  const { addProduct } = useContext(CompanyContext);
  const fileInputRef = useRef(null);
  const arQrInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category_id: '',
    min_price: '',
    max_price: '',
    discount_percentage: '0',
    stock_quantity: '1',
    promo_code: '',
    promo_discount_value: '',
    brand: '',
    model: '',
    color: '',
    weight: '',
    warranty: '',
    is_negotiable: false,
    is_ar_3d: false,
    ar_url: '',
    is_cod_allowed: false,
    cod_advance_amount: ''
  });

  const [images, setImages] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [arQrImage, setArQrImage] = useState(null);
  const [arQrPreview, setArQrPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'discount_percentage' && parseFloat(value) < 0) return;

    // When AR 3D is disabled, clear dependent fields
    if (name === 'is_ar_3d' && type === 'checkbox' && !checked) {
      setArQrImage(null);
      if (arQrPreview) URL.revokeObjectURL(arQrPreview);
      setArQrPreview('');
      setFormData(prev => ({
        ...prev,
        is_ar_3d: false,
        ar_url: ''
      }));
      return;
    }

    // When COD is disabled, clear the advance amount
    if (name === 'is_cod_allowed' && type === 'checkbox' && !checked) {
      setFormData(prev => ({ ...prev, is_cod_allowed: false, cod_advance_amount: '' }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    if (files.length + images.length > 10) {
      setError('Maximum 10 images allowed');
      return;
    }

    setError('');
    setImages(prev => [...prev, ...files]);

    const previews = files.map(file => URL.createObjectURL(file));
    setImagePreviews(prev => [...prev, ...previews]);
    
    // Reset file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleArQrChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (arQrPreview) {
      URL.revokeObjectURL(arQrPreview);
    }

    setError('');
    setArQrImage(file);
    setArQrPreview(URL.createObjectURL(file));

    if (arQrInputRef.current) {
      arQrInputRef.current.value = '';
    }
  };

  const removeArQr = () => {
    setArQrImage(null);
    if (arQrPreview) URL.revokeObjectURL(arQrPreview);
    setArQrPreview('');
  };

  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name || !formData.min_price || !formData.max_price || !formData.category_id) {
      setError('Please fill in all required fields (name, min price, max price, category)');
      return;
    }

    if (!formData.description || !formData.brand || !formData.model || !formData.color) {
      setError('Description, Brand, Model/Size, and Color are required');
      return;
    }

    if (!isValidPrice(formData.min_price)) {
      setError('Min price must be a positive number with at most 2 decimal places');
      return;
    }
    if (!isValidPrice(formData.max_price)) {
      setError('Max price must be a positive number with at most 2 decimal places');
      return;
    }

    if (parseFloat(formData.min_price) > parseFloat(formData.max_price)) {
      setError('Minimum price cannot be greater than maximum price');
      return;
    }

    if (formData.stock_quantity !== '' && !isValidQuantity(formData.stock_quantity)) {
      setError('Stock quantity must be an integer between 1 and 999999');
      return;
    }
    if (formData.discount_percentage !== '' && !isValidPercentage(formData.discount_percentage)) {
      setError('Discount percentage must be between 0 and 100');
      return;
    }
    if (formData.ar_url && formData.ar_url.trim() && !isValidUrl(formData.ar_url)) {
      setError('AR URL must start with http:// or https://');
      return;
    }

    if (images.length === 0) {
      setError('Please upload at least one product image');
      return;
    }

    if (formData.is_cod_allowed) {
      const advAmt = parseFloat(formData.cod_advance_amount);
      if (!formData.cod_advance_amount || isNaN(advAmt) || advAmt <= 0) {
        setError('A minimum upfront payment amount greater than 0 is required when Cash on Delivery is enabled');
        return;
      }
    }

    if (formData.is_ar_3d) {
      if (!formData.ar_url?.trim()) {
        setError('Please provide the AR URL');
        return;
      }
      if (!arQrImage) {
        setError('Please upload one AR QR code image');
        return;
      }
    }

    setSubmitting(true);

    const fd = new FormData();
    fd.append('company_id', companyId);
    Object.keys(formData).forEach(key => {
      if (key === 'is_negotiable' || key === 'is_ar_3d' || key === 'is_cod_allowed') {
        fd.append(key, formData[key] ? '1' : '0');
      } else if (formData[key]) {
        fd.append(key, formData[key]);
      }
    });
    images.forEach(img => fd.append('images', img));

    if (formData.is_ar_3d && arQrImage) {
      fd.append('ar_qr_image', arQrImage);
    }

    const result = await addProduct(fd);

    if (result.success) {
      onProductAdded();
    } else {
      const debugInfo = result.debug ? ` [${result.debug}]` : '';
      setError((result.message || 'Failed to create product. Check file sizes (max 25MB each).') + debugInfo);
    }
    setSubmitting(false);
  };

  return (
    <div className="apm-overlay" onClick={onClose}>
      <div className="apm-modal" onClick={e => e.stopPropagation()}>
        <div className="apm-header">
          <div className="apm-header-title">
            <Package size={20} className="apm-header-icon" />
            <h2>Add New Product</h2>
          </div>
          <button className="apm-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form className="apm-form" onSubmit={handleSubmit}>
          {/* Image Upload */}
          <div className="apm-section">
            <label>Product Images *</label>
            <div className="apm-images">
              {imagePreviews.map((preview, idx) => (
                <div key={idx} className="apm-image-preview">
                  <img src={preview} alt={`Preview ${idx}`} />
                  <button type="button" onClick={() => removeImage(idx)} className="apm-remove-img">
                    <X size={14} />
                  </button>
                  {idx === 0 && <span className="apm-primary-badge">Primary</span>}
                </div>
              ))}
              {images.length < 10 && (
                <div className="apm-upload-box" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={24} />
                  <span>Upload</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
          </div>

          {/* Title & Description */}
          <div className="apm-row">
            <div className="apm-field full">
              <label>Product Title * <span className="apm-hint">({formData.name.length}/25)</span></label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Product name"
                maxLength={25}
                required
              />
            </div>
          </div>

          <div className="apm-row">
            <div className="apm-field full">
              <label>Description *</label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Add more information for more sales..."
                rows={4}
                required
              />
            </div>
          </div>

          {/* Category */}
          <div className="apm-row">
            <div className="apm-field">
              <label>Category *</label>
              <select name="category_id" value={formData.category_id} onChange={handleChange} required>
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="apm-field">
              <label>Brand *</label>
              <input name="brand" value={formData.brand} onChange={handleChange} placeholder="Brand name" required />
            </div>
          </div>

          {/* Prices */}
          <div className="apm-row">
            <div className="apm-field">
              <label>Minimum Price * <span className="apm-hint">(Hidden from customer)</span></label>
              <input name="min_price" type="number" step="0.01" min="0" value={formData.min_price} onChange={handleChange} placeholder="900.00" required />
            </div>
            <div className="apm-field">
              <label>Maximum Price * <span className="apm-hint">(Visible to customer)</span></label>
              <input name="max_price" type="number" step="0.01" min="0" value={formData.max_price} onChange={handleChange} placeholder="1000.00" required />
            </div>
          </div>

          <div className="apm-row">
            <div className="apm-field">
              <label>Discount % <span className="apm-hint">(Cannot be negative)</span></label>
              <input name="discount_percentage" type="number" step="0.01" min="0" max="100" value={formData.discount_percentage} onChange={handleChange} placeholder="0" />
            </div>
            <div className="apm-field">
              <label>Stock Quantity</label>
              <input name="stock_quantity" type="number" min="0" value={formData.stock_quantity} onChange={handleChange} placeholder="1" />
            </div>
          </div>

          {/* Promo Code */}
          <div className="apm-row">
            <div className="apm-field">
              <label>Promo Code</label>
              <input name="promo_code" value={formData.promo_code} onChange={handleChange} placeholder="SAVE10" />
            </div>
            <div className="apm-field">
              <label>Promo Discount Value %</label>
              <input name="promo_discount_value" type="number" step="0.01" min="0" value={formData.promo_discount_value} onChange={handleChange} placeholder="10" />
            </div>
          </div>

          {/* Extra Details */}
          <div className="apm-row">
            <div className="apm-field">
              <label>Model/Size *</label>
              <input name="model" value={formData.model} onChange={handleChange} placeholder="Model / Size (e.g. iPhone 15 Pro / XL)" required />
            </div>
            <div className="apm-field">
              <label>Color *</label>
              <input name="color" value={formData.color} onChange={handleChange} placeholder="Color" required />
            </div>
          </div>

          <div className="apm-row">
            <div className="apm-field">
              <label>Warranty</label>
              <input name="warranty" value={formData.warranty} onChange={handleChange} placeholder="1 year" />
            </div>
            <div className="apm-field">
              <label>Weight</label>
              <input name="weight" value={formData.weight} onChange={handleChange} placeholder="500g" />
            </div>
          </div>

          {/* AI Negotiator Toggle */}
          <div className="apm-section">
            <label className="apm-toggle-label">
              <input
                type="checkbox"
                name="is_negotiable"
                checked={formData.is_negotiable}
                onChange={handleChange}
              />
              <span>Allow AI Price Negotiation for this product</span>
            </label>
          </div>

          {/* COD Toggle */}
          <div className="apm-section">
            <label className="apm-toggle-label">
              <input
                type="checkbox"
                name="is_cod_allowed"
                checked={formData.is_cod_allowed}
                onChange={handleChange}
              />
              <span>Allow Cash on Delivery (COD) for this product</span>
            </label>
            {formData.is_cod_allowed && (
              <div className="apm-field" style={{ marginTop: '10px' }}>
                <label>COD Minimum Upfront Payment (৳) * <span style={{ color: '#dc2626', fontWeight: 500 }}>Required</span></label>
                <input
                  type="number"
                  name="cod_advance_amount"
                  value={formData.cod_advance_amount}
                  onChange={handleChange}
                  placeholder="e.g. 50 — customer pays this amount to confirm order"
                  min="0.01"
                  step="0.01"
                  className="apm-input"
                  required
                />
                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                  Customer pays only this amount at checkout. Remaining balance is collected on delivery.
                </p>
              </div>
            )}
          </div>

          {/* AR 3D Toggle */}
          <div className="apm-section">
            <label className="apm-toggle-label">
              <input
                type="checkbox"
                name="is_ar_3d"
                checked={formData.is_ar_3d}
                onChange={handleChange}
              />
              <span>Enable AR 3D product (QR + URL)</span>
            </label>

            {formData.is_ar_3d && (
              <div className="apm-ar-fields">
                <div className="apm-row">
                  <div className="apm-field">
                    <label>AR URL *</label>
                    <input
                      name="ar_url"
                      value={formData.ar_url}
                      onChange={handleChange}
                      placeholder="https://..."
                      required
                    />
                  </div>

                  <div className="apm-field">
                    <label>AR QR Code Image *</label>
                    <div className="apm-ar-qr">
                      {arQrPreview ? (
                        <div className="apm-ar-qr-preview">
                          <img src={arQrPreview} alt="AR QR preview" />
                          <button type="button" className="apm-ar-remove" onClick={removeArQr}>
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="apm-upload-box" onClick={() => arQrInputRef.current?.click()}>
                          <Upload size={24} />
                          <span>Upload</span>
                        </div>
                      )}
                    </div>

                    <input
                      ref={arQrInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleArQrChange}
                      style={{ display: 'none' }}
                    />
                    <p className="apm-image-hint">Upload only 1 QR code image.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Display Price Preview */}
          {formData.max_price && (() => {
            const maxP = parseFloat(formData.max_price) || 0;
            const disc = parseFloat(formData.discount_percentage) || 0;
            const saleP = disc > 0 ? maxP - (maxP * disc / 100) : maxP;
            const autoPoints = Math.floor(saleP * 0.1);
            const autoStars = (saleP * 0.005).toFixed(1);
            return (
              <div className="apm-price-preview">
                <h4>Price & Rewards Preview</h4>
                <div className="apm-price-row">
                  <span>Max Price:</span>
                  <span>৳{maxP.toFixed(2)}</span>
                </div>
                <div className="apm-price-row">
                  <span>Discount:</span>
                  <span>{disc}%</span>
                </div>
                <div className="apm-price-row highlight">
                  <span>Customer Sees:</span>
                  <span>৳{saleP.toFixed(2)}</span>
                </div>
                <div className="apm-price-row min-row">
                  <span>Min Price (AI Floor):</span>
                  <span>৳{parseFloat(formData.min_price || 0).toFixed(2)}</span>
                </div>
                <div className="apm-price-row apm-reward-row">
                  <span><Target size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Auto Points Reward:</span>
                  <span>+{autoPoints} pts</span>
                </div>
                <div className="apm-price-row apm-reward-row">
                  <span><Star size={13} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Auto Stars Reward:</span>
                  <span>+{autoStars} ★</span>
                </div>
              </div>
            );
          })()}

          {error && <p className="apm-error">{error}</p>}

          <button type="submit" className="apm-submit" disabled={submitting}>
            {submitting ? 'Uploading...' : 'Upload Product'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddProductModal;
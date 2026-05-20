import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';
import { Star } from 'lucide-react';
import './CompanyReview.css';

const CompanyReview = ({ companyId, companyName, onClose, onReviewSubmitted }) => {
    const { user } = useContext(AuthContext);
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!rating) {
            setError('Please select a rating');
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            const res = await api.post('/companies/rate', {
                company_id: companyId,
                rating,
                review_text: reviewText
            });
            if (res.data.success) {
                if (onReviewSubmitted) onReviewSubmitted();
                onClose();
            } else {
                setError(res.data.message || 'Failed to submit review');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="company-review-overlay" onClick={onClose}>
            <div className="company-review-modal" onClick={(e) => e.stopPropagation()}>
                <div className="company-review-modal__header">
                    <div className="company-review-modal__title-row">
                        <h3>Rate {companyName}</h3>
                        <span className="company-review-badge">Company Review</span>
                    </div>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>
                <div className="company-review-modal__body">
                    <p className="review-type-note">
                        This review is for the <strong>company</strong>, not a specific product.
                        Your <Star size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle' }} /> stars will be spent on submission.
                    </p>
                    <p className="review-info">
                        Available stars: <strong><Star size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle' }} /> {parseFloat(user?.stars || 0).toFixed(2)}</strong>
                    </p>
                    <div className="company-review-modal__stars">
                        {[1, 2, 3, 4, 5].map(star => (
                            <span
                                key={star}
                                className={`review-star-large ${star <= (hoverRating || rating) ? 'gold' : 'silver'}`}
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                            >
                                ★
                            </span>
                        ))}
                    </div>
                    <p className="star-label">
                        {rating > 0 ? `${rating} star${rating > 1 ? 's' : ''} will be spent` : 'Select your rating'}
                    </p>
                    <textarea
                        placeholder="Share your experience with this company (optional)..."
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        rows={4}
                    />
                    {error && <p className="review-error">{error}</p>}
                    <button
                        className="submit-review-btn"
                        onClick={handleSubmit}
                        disabled={!rating || submitting}
                    >
                        {submitting ? 'Submitting...' : <>Submit Company Review (Spend {rating || 0} <Star size={12} fill="currentColor" style={{ display: 'inline', verticalAlign: 'middle' }} />)</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CompanyReview;

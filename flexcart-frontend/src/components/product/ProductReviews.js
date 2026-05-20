import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { Check } from 'lucide-react';
import './ProductReviews.css';

const AVATAR_COLORS = ['#2563eb','#7c3aed','#059669','#dc2626','#d97706','#0284c7','#db2777'];
const getAvatarColor = (name) => AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
};

const ReviewAvatar = ({ src, username }) => {
    const [imgError, setImgError] = useState(false);
    if (src && !imgError) {
        return <img src={src} alt={username} className="review-item__avatar" onError={() => setImgError(true)} />;
    }
    return (
        <div className="review-item__avatar review-item__avatar--initials" style={{ background: getAvatarColor(username) }}>
            {getInitials(username)}
        </div>
    );
};

const getCustomerBadge = (orderCount) => {
    if (!orderCount || orderCount < 1) return null;
    if (orderCount >= 31) return { label: 'VIP', color: '#7c3aed', bg: '#f5f3ff' };
    if (orderCount >= 16) return { label: 'Loyal', color: '#0284c7', bg: '#e0f2fe' };
    if (orderCount >= 4)  return { label: 'Regular', color: '#059669', bg: '#dcfce7' };
    return { label: 'New Customer', color: '#d97706', bg: '#fffbeb' };
};

const ProductReviews = ({ productId, reviews = [], onReviewAdded }) => {
    const { user } = useContext(AuthContext);
    const [rating, setRating] = useState(0);
    const [hoverRating, setHoverRating] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

    const handleSubmitReview = async () => {
        if (!rating || !user) return;
        setSubmitting(true);
        try {
            const res = await api.post(`/products/${productId}/reviews`, {
                rating,
                review_text: reviewText
            });
            if (res.data.success) {
                toast.success('Review submitted!');
                setRating(0);
                setReviewText('');
                if (onReviewAdded) onReviewAdded();
            } else {
                toast.error(res.data.message || 'Failed to submit review');
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to submit review');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="product-reviews">
            {user && (
                <div className="product-reviews__form">
                    <h4>Write a Review</h4>
                    <div className="product-reviews__stars">
                        {[1, 2, 3, 4, 5].map(star => (
                            <span
                                key={star}
                                className={`review-star ${star <= (hoverRating || rating) ? 'filled' : ''}`}
                                onClick={() => setRating(star)}
                                onMouseEnter={() => setHoverRating(star)}
                                onMouseLeave={() => setHoverRating(0)}
                            >
                                ★
                            </span>
                        ))}
                        <span className="rating-label">
                            {rating > 0 ? `${rating}/5` : 'Select rating'}
                        </span>
                    </div>
                    <textarea
                        placeholder="Share your experience with this product..."
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        rows={3}
                    />
                    <button
                        onClick={handleSubmitReview}
                        disabled={!rating || submitting}
                        className="submit-review-btn"
                    >
                        {submitting ? 'Submitting...' : 'Submit Review'}
                    </button>
                </div>
            )}

            <div className="product-reviews__list">
                {reviews.length === 0 ? (
                    <p className="no-reviews">No reviews yet. Be the first!</p>
                ) : (
                    reviews.map(review => (
                        <div key={review.id} className="review-item">
                            <div className="review-item__header">
                                <div className="review-item__user">
                                    <ReviewAvatar
                                        src={review.profile_image ? `${API_BASE}${review.profile_image}` : null}
                                        username={review.username}
                                    />
                                    <div>
                                        <div className="review-item__name-row">
                                            <span className="review-item__name">{review.username || 'Anonymous'}</span>
                                            {(() => {
                                                const badge = getCustomerBadge(review.order_count);
                                                return badge ? (
                                                    <span
                                                        className="review-item__badge"
                                                        style={{ color: badge.color, background: badge.bg }}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                        {review.is_verified_purchase === 1 && (
                                            <span className="review-item__verified"><Check size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />Verified Purchase</span>
                                        )}
                                    </div>
                                </div>
                                <div className="review-item__rating">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <span key={star} className={`star-small ${star <= review.rating ? 'filled' : ''}`}>★</span>
                                    ))}
                                </div>
                            </div>
                            {review.review_text && <p className="review-item__text">{review.review_text}</p>}
                            <span className="review-item__date">{new Date(review.created_at).toLocaleDateString()}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default ProductReviews;

import React, { useState, useContext } from 'react';
import { AuthContext } from '../../context/AuthContext';
import api from '../../services/api';
import { MessageSquare } from 'lucide-react';
import './ProductComments.css';

const ProductComments = ({
    productId,
    comments = [],
    onCommentAdded,
    isSeller = false,
    companyOwnerId = null,
    companyLogo = null,
    companyName = null
}) => {
    const { user } = useContext(AuthContext);
    const [commentText, setCommentText] = useState('');
    const [replyTo, setReplyTo] = useState(null); // { id, username, text }
    const [replyText, setReplyText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [expandedReplies, setExpandedReplies] = useState(new Set());

    const toggleReplies = (commentId) => {
        setExpandedReplies(prev => {
            const next = new Set(prev);
            if (next.has(commentId)) next.delete(commentId);
            else next.add(commentId);
            return next;
        });
    };

    const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

    const isSellerUser = (userId) => companyOwnerId && userId === companyOwnerId;

    const getImg = (profileImage) =>
        profileImage ? `${API_BASE}${profileImage}` : '/default-avatar.png';

    const handleSubmitComment = async (parentId = null) => {
        const text = parentId ? replyText : commentText;
        if (!text.trim() || !user) return;

        setSubmitting(true);
        try {
            const res = await api.post(`/products/${productId}/comments`, {
                comment_text: text,
                parent_id: parentId
            });
            if (res.data.success) {
                setCommentText('');
                setReplyText('');
                setReplyTo(null);
                if (onCommentAdded) onCommentAdded();
            }
        } catch (err) {
            console.error('Submit comment error:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const openReply = (comment) => {
        setReplyTo({ id: comment.id, username: comment.username, text: comment.comment_text });
        setReplyText('');
    };

    const closeReply = () => {
        setReplyTo(null);
        setReplyText('');
    };

    // Render avatar + name for a comment/reply, using company branding for seller posts
    const renderAuthor = (entry) => {
        const isSel = isSellerUser(entry.user_id);
        const logo = isSel && companyLogo ? `${API_BASE}${companyLogo}` : getImg(entry.profile_image);
        const name = isSel && companyName ? companyName : entry.username;
        return { logo, name, isSel };
    };

    return (
        <div className="product-comments">
            {/* Top-level comment box — hidden for seller (sellers only reply) */}
            {user && !isSeller && (
                <div className="product-comments__form">
                    <div className="product-comments__input-row">
                        <img src={getImg(user.profile_image)} alt={user.username} className="comment-avatar" />
                        <div className="product-comments__input-wrap">
                            <textarea
                                placeholder="Ask a question or leave a comment..."
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                rows={2}
                            />
                            <button onClick={() => handleSubmitComment(null)} disabled={!commentText.trim() || submitting}>
                                {submitting ? '...' : 'Post'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="product-comments__list">
                {comments.length === 0 ? (
                    <p className="no-comments">No comments yet. Be the first to ask!</p>
                ) : (
                    comments.map(comment => {
                        const { logo, name, isSel } = renderAuthor(comment);
                        return (
                            <div key={comment.id} className="comment-item">
                                <div className="comment-item__main">
                                    <img src={logo} alt={name} className="comment-avatar" />
                                    <div className={`comment-item__content${isSel ? ' comment-item__content--seller' : ''}`}>
                                        <div className="comment-item__header">
                                            <span className="comment-item__name">{name}</span>
                                            {isSel && <span className="comment-seller-badge">Seller</span>}
                                            <span className="comment-item__date">{formatDate(comment.created_at)}</span>
                                            {/* Arrow toggle — always visible to everyone when replies exist */}
                                            {comment.replies && comment.replies.length > 0 && (
                                                <button
                                                    className="comment-item__replies-toggle"
                                                    onClick={() => toggleReplies(comment.id)}
                                                >
                                                    <span className={`replies-arrow${expandedReplies.has(comment.id) ? ' replies-arrow--open' : ''}`}>▶</span>
                                                    <span>{comment.replies.length} {comment.replies.length === 1 ? 'reply' : 'replies'}</span>
                                                </button>
                                            )}
                                        </div>
                                        <p className="comment-item__text">{comment.comment_text}</p>
                                        {/* Reply button — only visible to the seller */}
                                        {isSeller && (
                                            <button
                                                className="comment-item__reply-btn"
                                                onClick={() => replyTo?.id === comment.id ? closeReply() : openReply(comment)}
                                            >
                                                <MessageSquare size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />Reply as Seller
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Reply form with quoted context */}
                                {replyTo?.id === comment.id && (
                                    <div className="reply-form">
                                        {isSeller && (
                                            <div className="reply-form__seller-header">
                                                {companyLogo && (
                                                    <img src={`${API_BASE}${companyLogo}`} alt={companyName} className="reply-form__company-logo" />
                                                )}
                                                <span className="reply-form__seller-label">Replying as <strong>{companyName || 'Seller'}</strong></span>
                                            </div>
                                        )}
                                        <div className="reply-form__quote">
                                            <span className="reply-form__quote-author">@{replyTo.username}</span>
                                            <p className="reply-form__quote-text">{replyTo.text.length > 120 ? replyTo.text.slice(0, 120) + '…' : replyTo.text}</p>
                                        </div>
                                        <textarea
                                            placeholder={`Write your reply...`}
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            rows={2}
                                            autoFocus
                                        />
                                        <div className="reply-actions">
                                            <button onClick={closeReply} className="cancel-btn">Cancel</button>
                                            <button
                                                onClick={() => handleSubmitComment(comment.id)}
                                                disabled={!replyText.trim() || submitting}
                                                className="reply-submit-btn"
                                            >
                                                {submitting ? '...' : 'Post Reply'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Existing replies — shown only when expanded */}
                                {comment.replies && comment.replies.length > 0 && expandedReplies.has(comment.id) && (
                                    <div className="comment-item__replies">
                                        {comment.replies.map(reply => {
                                            const ra = renderAuthor(reply);
                                            return (
                                                <div key={reply.id} className={`reply-item${ra.isSel ? ' reply-item--seller' : ''}`}>
                                                    <img src={ra.logo} alt={ra.name} className="comment-avatar small" />
                                                    <div className={`comment-item__content${ra.isSel ? ' comment-item__content--seller' : ''}`}>
                                                        <div className="comment-item__header">
                                                            <span className="comment-item__name">{ra.name}</span>
                                                            {ra.isSel && <span className="comment-seller-badge">Seller</span>}
                                                            <span className="comment-item__date">{formatDate(reply.created_at)}</span>
                                                        </div>
                                                        <p className="comment-item__text">{reply.comment_text}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default ProductComments;

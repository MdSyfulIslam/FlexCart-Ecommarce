import React, { useState, useEffect, useRef, useContext } from 'react';
import {
    Bot, User, Lock, AlertTriangle, RefreshCw,
    Tag, ShoppingCart, CheckCircle, X
} from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { CartContext } from '../../context/CartContext';
import api from '../../services/api';
import './AINegotiator.css';

const AINegotiator = ({ productId, productName, currentPrice, onClose, onPriceAccepted }) => {
    const { user } = useContext(AuthContext);
    const { addToCart } = useContext(CartContext);
    const [messages, setMessages] = useState([]);
    const [options, setOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [negotiationId, setNegotiationId] = useState(null);
    const [status, setStatus] = useState('active');
    const [error, setError] = useState(null);
    const [inputText, setInputText] = useState('');
    const [addedToCart, setAddedToCart] = useState(false);
    const [acceptedPrice, setAcceptedPrice] = useState(null);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (user) startNegotiation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const startNegotiation = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.post('/negotiations/start', { product_id: productId });
            if (res.data.success) {
                setNegotiationId(res.data.negotiation.id);
                setMessages(res.data.messages || []);
                setOptions(res.data.availableOptions || []);
                setStatus(res.data.negotiation.status || 'active');
            } else {
                setError(res.data.message || 'Failed to start negotiation.');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Server error. Please try again.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleAccepted = async (finalPrice) => {
        setAcceptedPrice(finalPrice);
        if (onPriceAccepted) onPriceAccepted(finalPrice);
        try {
            await addToCart(productId, 1, finalPrice);
            setAddedToCart(true);
        } catch {
            // cart add failed silently — user can still add manually
        }
    };

    const sendMessage = async (messageType, price = null) => {
        if (!negotiationId || status !== 'active') return;
        setLoading(true);
        try {
            const payload = { negotiation_id: negotiationId, message_type: messageType };
            if (price !== null && price !== undefined) payload.price = price;
            const res = await api.post('/negotiations/message', payload);
            if (res.data.success) {
                setMessages(res.data.messages || []);
                setOptions(res.data.availableOptions || []);
                setStatus(res.data.status || 'active');
                if (res.data.finalPrice && res.data.status === 'accepted') {
                    await handleAccepted(res.data.finalPrice);
                }
            } else {
                setError(res.data.message || 'Failed to process response.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Server error. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const sendCustomMessage = async () => {
        const text = inputText.trim();
        if (!text || !negotiationId || status !== 'active') return;
        setInputText('');
        setLoading(true);
        try {
            const res = await api.post('/negotiations/message', {
                negotiation_id: negotiationId,
                message_type: 'custom',
                text,
            });
            if (res.data.success) {
                setMessages(res.data.messages || []);
                setOptions(res.data.availableOptions || []);
                setStatus(res.data.status || 'active');
                if (res.data.finalPrice && res.data.status === 'accepted') {
                    await handleAccepted(res.data.finalPrice);
                }
            } else {
                setError(res.data.message || 'Failed to process message.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Server error. Please try again.');
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    };

    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendCustomMessage();
        }
    };

    // Strips leading emoji/symbol prefixes from backend-supplied button labels
    const cleanOptionText = (text) => text.replace(/^[\u2705\u{1F600}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\s]+/u, '').trim();

    // Not logged in
    if (!user) {
        return (
            <div className="ai-negotiator-overlay" onClick={onClose}>
                <div className="ai-negotiator" onClick={e => e.stopPropagation()}>
                    <div className="ai-negotiator__header">
                        <div className="ai-negotiator__header-left">
                            <span className="ai-negotiator__robot-wrap">
                                <Bot size={22} />
                            </span>
                            <div><h3>AI Cost Negotiator</h3></div>
                        </div>
                        <button className="ai-negotiator__close" onClick={onClose}><X size={16} /></button>
                    </div>
                    <div className="ai-negotiator__auth-required">
                        <Lock size={42} className="ai-negotiator__state-icon" />
                        <p>Please <strong>sign in</strong> to use the AI Negotiator.</p>
                        <button className="ai-negotiator__done-btn" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ai-negotiator-overlay" onClick={onClose}>
            <div className="ai-negotiator" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="ai-negotiator__header">
                    <div className="ai-negotiator__header-left">
                        <span className="ai-negotiator__robot-wrap">
                            <Bot size={22} />
                        </span>
                        <div>
                            <h3>AI Cost Negotiator</h3>
                            <p className="ai-negotiator__product-name">{productName}</p>
                        </div>
                    </div>
                    <button className="ai-negotiator__close" onClick={onClose}><X size={16} /></button>
                </div>

                {/* Messages */}
                <div className="ai-negotiator__messages">
                    {error && !loading && (
                        <div className="ai-negotiator__error">
                            <AlertTriangle size={32} className="ai-negotiator__state-icon ai-negotiator__state-icon--warn" />
                            <p>{error}</p>
                            <button className="ai-negotiator__retry-btn" onClick={startNegotiation}>
                                <RefreshCw size={13} className="ai-negotiator__btn-icon" />
                                Retry
                            </button>
                        </div>
                    )}

                    {!error && !loading && messages.length === 0 && (
                        <div className="ai-negotiator__error">
                            <Bot size={32} className="ai-negotiator__state-icon" />
                            <p>Could not start negotiation. The product may not be available for negotiation.</p>
                            <button className="ai-negotiator__retry-btn" onClick={startNegotiation}>
                                <RefreshCw size={13} className="ai-negotiator__btn-icon" />
                                Try Again
                            </button>
                        </div>
                    )}

                    {messages.map((msg, idx) => (
                        <div key={idx} className={`ai-negotiator__message ${msg.sender === 'ai' ? 'ai' : 'user'}`}>
                            {msg.sender === 'ai' && (
                                <span className="ai-negotiator__avatar ai-negotiator__avatar--bot">
                                    <Bot size={14} />
                                </span>
                            )}
                            <div className={`ai-negotiator__bubble ${msg.sender}`}>
                                <p>{msg.message_text}</p>
                                {msg.offered_price && (
                                    <span className="ai-negotiator__price-tag">
                                        <Tag size={11} className="ai-negotiator__btn-icon" />
                                        ৳{parseFloat(msg.offered_price).toFixed(2)}
                                    </span>
                                )}
                            </div>
                            {msg.sender === 'user' && (
                                <span className="ai-negotiator__avatar ai-negotiator__avatar--user">
                                    <User size={14} />
                                </span>
                            )}
                        </div>
                    ))}

                    {loading && (
                        <div className="ai-negotiator__typing">
                            <span className="ai-negotiator__avatar ai-negotiator__avatar--bot">
                                <Bot size={14} />
                            </span>
                            <div className="ai-negotiator__typing-dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Bottom Panel */}
                <div className="ai-negotiator__options">
                    {status === 'accepted' ? (
                        <div className="ai-negotiator__completed">
                            {addedToCart ? (
                                <>
                                    <p>
                                        <CheckCircle size={14} className="ai-negotiator__btn-icon ai-negotiator__btn-icon--green" />
                                        Negotiated price of ৳{parseFloat(acceptedPrice).toFixed(2)} locked in and added to cart!
                                    </p>
                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                        <button className="ai-negotiator__done-btn" onClick={() => { onClose(); window.location.href = '/cart'; }}>
                                            <ShoppingCart size={14} className="ai-negotiator__btn-icon" />
                                            Go to Cart
                                        </button>
                                        <button className="ai-negotiator__done-btn" style={{ background: '#6b7280' }} onClick={onClose}>
                                            Keep Shopping
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p>
                                        <CheckCircle size={14} className="ai-negotiator__btn-icon ai-negotiator__btn-icon--green" />
                                        Deal accepted at ৳{acceptedPrice ? parseFloat(acceptedPrice).toFixed(2) : ''}! Adding to cart...
                                    </p>
                                    <button className="ai-negotiator__done-btn" onClick={onClose}>Close</button>
                                </>
                            )}
                        </div>
                    ) : status !== 'active' ? (
                        <div className="ai-negotiator__completed">
                            <p>Negotiation ended. Come back anytime!</p>
                            <button className="ai-negotiator__done-btn" onClick={onClose}>Close</button>
                        </div>
                    ) : !error ? (
                        <>
                            {/* Pre-made option buttons */}
                            {options.length > 0 && (
                                <div className="ai-negotiator__option-buttons">
                                    {options.map((opt, idx) => (
                                        <button
                                            key={idx}
                                            className={`ai-negotiator__option ${opt.type.includes('accept') ? 'accept' : ''} ${opt.type === 'close' ? 'close' : ''}`}
                                            onClick={() => sendMessage(opt.type, opt.price ?? null)}
                                            disabled={loading}
                                        >
                                            {opt.type.includes('accept') && (
                                                <CheckCircle size={13} className="ai-negotiator__btn-icon" />
                                            )}
                                            {cleanOptionText(opt.text)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Free-text input */}
                            <div className="ai-negotiator__input-row">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className="ai-negotiator__text-input"
                                    placeholder="Type a price or message… (e.g. 450)"
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={handleInputKeyDown}
                                    disabled={loading}
                                />
                                <button
                                    className="ai-negotiator__send-btn"
                                    onClick={sendCustomMessage}
                                    disabled={loading || !inputText.trim()}
                                >
                                    Send
                                </button>
                            </div>
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default AINegotiator;

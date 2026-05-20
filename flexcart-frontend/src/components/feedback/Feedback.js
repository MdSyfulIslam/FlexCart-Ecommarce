import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageSquare, FiSend, FiAlertTriangle, FiClock, FiSearch, FiX, FiChevronDown } from 'react-icons/fi';
import { Check, AlertTriangle, MessageSquare } from 'lucide-react';
import feedbackService from '../../services/feedbackService';
import { AuthContext } from '../../context/AuthContext';
import { toast } from 'react-toastify';
import { debounce } from '../../utils/helpers';
import './Feedback.css';

const TYPE_TABS = [
  { key: 'feedback', label: 'General Feedback', icon: <FiMessageSquare size={16} /> },
  { key: 'complaint', label: 'Complaint / Report', icon: <FiAlertTriangle size={16} /> },
];

const STATUS_LABEL = { pending: 'Pending', reviewed: 'Reviewed', resolved: 'Resolved' };
const STATUS_COLOR = { pending: '#d97706', reviewed: '#2563eb', resolved: '#059669' };

const Feedback = () => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Complaint company selector
  const [companyQuery, setCompanyQuery] = useState('');
  const [companySuggestions, setCompanySuggestions] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [companyDropOpen, setCompanyDropOpen] = useState(false);
  const companyRef = useRef(null);

  // History tab
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Close company dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (companyRef.current && !companyRef.current.contains(e.target)) setCompanyDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchCompanies = useCallback(
    debounce(async (q) => {
      if (!q || q.length < 1) { setCompanySuggestions([]); return; }
      try {
        const res = await feedbackService.searchCompanies(q);
        if (res.data.success) setCompanySuggestions(res.data.data);
      } catch { setCompanySuggestions([]); }
    }, 300),
    []
  );

  const handleCompanyQueryChange = (e) => {
    const val = e.target.value;
    setCompanyQuery(val);
    setSelectedCompany(null);
    setCompanyDropOpen(true);
    searchCompanies(val);
  };

  const selectCompany = (company) => {
    setSelectedCompany(company);
    setCompanyQuery(company.name);
    setCompanyDropOpen(false);
    setCompanySuggestions([]);
  };

  const clearCompany = () => {
    setSelectedCompany(null);
    setCompanyQuery('');
    setCompanySuggestions([]);
  };

  const loadHistory = async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await feedbackService.getMyFeedbacks();
      if (res.data.success) setHistory(res.data.data);
    } catch { /* silent */ }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) { toast.error('Please enter your message'); return; }
    if (activeTab === 'complaint' && !selectedCompany) {
      toast.error('Please select the company you are reporting'); return;
    }
    setLoading(true);
    try {
      const payload = {
        subject: subject.trim() || (activeTab === 'complaint' ? 'Complaint' : 'General Feedback'),
        message: message.trim(),
        feedback_type: activeTab,
        ...(activeTab === 'complaint' && selectedCompany ? { company_id: selectedCompany.id } : {})
      };
      const res = await feedbackService.submitFeedback(payload);
      if (res.data.success) {
        setSubmitted(true);
        setSubject('');
        setMessage('');
        setSelectedCompany(null);
        setCompanyQuery('');
        setTimeout(() => setSubmitted(false), 4000);
      } else {
        toast.error(res.data.message || 'Failed to submit');
      }
    } catch {
      toast.error('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="feedback-page">
      <div className="section-header">
        <h2><FiMessageSquare /> Feedback &amp; Complaints</h2>
        <p>Share your thoughts or report an issue — our team reviews every submission</p>
      </div>

      {/* Type toggle */}
      <div className="fb-type-tabs">
        {TYPE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`fb-type-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.key); setSubmitted(false); }}
            type="button"
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="success"
            className="fb-success"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="fb-success-icon"><Check size={24} /></span>
            <div>
              <strong>{activeTab === 'complaint' ? 'Complaint submitted!' : 'Thank you for your feedback!'}</strong>
              <p>Our team will review your submission and take appropriate action.</p>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key={activeTab}
            className="feedback-form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Complaint-only: company selector */}
            {activeTab === 'complaint' && (
              <div className="form-group">
                <label className="form-label">
                  Company Being Reported <span className="fb-required">*</span>
                </label>
                <div className="fb-company-selector" ref={companyRef}>
                  <div className="fb-company-input-wrap">
                    <FiSearch size={15} className="fb-company-icon" />
                    <input
                      className="fb-company-input"
                      placeholder="Search company name…"
                      value={companyQuery}
                      onChange={handleCompanyQueryChange}
                      onFocus={() => companyQuery && setCompanyDropOpen(true)}
                      autoComplete="off"
                    />
                    {selectedCompany ? (
                      <button type="button" className="fb-company-clear" onClick={clearCompany}>
                        <FiX size={14} />
                      </button>
                    ) : (
                      <FiChevronDown size={15} className="fb-company-caret" />
                    )}
                  </div>
                  {selectedCompany && (
                    <div className="fb-company-selected">
                      <span className="fb-company-selected-badge"><Check size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '2px' }} />{selectedCompany.name}</span>
                    </div>
                  )}
                  <AnimatePresence>
                    {companyDropOpen && companySuggestions.length > 0 && (
                      <motion.ul
                        className="fb-company-dropdown"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                      >
                        {companySuggestions.map(c => (
                          <li key={c.id} onClick={() => selectCompany(c)} className="fb-company-option">
                            {c.name}
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Subject <span className="fb-optional">(optional)</span></label>
              <input
                className="form-input"
                placeholder={activeTab === 'complaint' ? 'Brief description of the issue…' : 'What is this about?'}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">
                {activeTab === 'complaint' ? 'Describe the Issue' : 'Your Feedback'}{' '}
                <span className="fb-required">*</span>
              </label>
              <textarea
                className="form-input feedback-textarea"
                placeholder={
                  activeTab === 'complaint'
                    ? 'Describe the problem in detail — include dates, order numbers, or any relevant information…'
                    : 'Share your thoughts, suggestions, or any experience you would like to tell us…'
                }
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            <motion.button
              type="submit"
              className={`feedback-submit-btn ${activeTab === 'complaint' ? 'feedback-submit-btn--complaint' : ''}`}
              disabled={loading}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              {activeTab === 'complaint' ? <FiAlertTriangle size={17} /> : <FiSend size={17} />}
              {loading ? 'Submitting…' : (activeTab === 'complaint' ? 'Submit Complaint' : 'Submit Feedback')}
            </motion.button>
          </motion.form>
        )}
      </AnimatePresence>

      {/* History section (logged-in users only) */}
      {user && (
        <div className="fb-history-section">
          <button
            className="fb-history-toggle"
            type="button"
            onClick={() => setShowHistory(v => !v)}
          >
            <FiClock size={15} />
            {showHistory ? 'Hide' : 'View'} My Submission History
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                className="fb-history"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22 }}
              >
                {historyLoading ? (
                  <p className="fb-history-loading">Loading…</p>
                ) : history.length === 0 ? (
                  <p className="fb-history-empty">No submissions yet.</p>
                ) : (
                  <ul className="fb-history-list">
                    {history.map(item => (
                      <li key={item.id} className="fb-history-item">
                        <div className="fb-history-item__top">
                          <span className={`fb-type-badge fb-type-badge--${item.feedback_type}`}>
                            {item.feedback_type === 'complaint' ? <><AlertTriangle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Complaint</> : <><MessageSquare size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />Feedback</>}
                          </span>
                          <span
                            className="fb-status-badge"
                            style={{ color: STATUS_COLOR[item.status] || '#6b7280' }}
                          >
                            {STATUS_LABEL[item.status] || item.status}
                          </span>
                          <span className="fb-history-date">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {item.subject && <p className="fb-history-subject">{item.subject}</p>}
                        <p className="fb-history-msg">{item.message}</p>
                        {item.admin_reply && (
                          <div className="fb-admin-reply">
                            <span className="fb-admin-reply__label">Admin Reply</span>
                            <p>{item.admin_reply}</p>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default Feedback;

import React, { useState, useEffect, useContext, useCallback } from 'react';
import api from '../../services/api';
import { FiAward, FiTrendingUp } from 'react-icons/fi';
import { Award, Star, Users, ShoppingCart } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import './CompanyLeaderboard.css';

const CompanyLeaderboard = ({ onRequireAuth }) => {
  const { isAuthenticated } = useContext(AuthContext);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000/api').replace('/api', '');

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/companies/leaderboard?limit=100');
      if (res.data.success) {
        setLeaderboard(res.data.data.leaderboard);
      }
    } catch (err) {
      console.error('Fetch leaderboard error:', err);
      if (err?.response?.status === 401 && onRequireAuth) {
        onRequireAuth();
      }
    } finally {
      setLoading(false);
    }
  }, [onRequireAuth]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      if (onRequireAuth) onRequireAuth();
      return;
    }
    fetchLeaderboard();
  }, [isAuthenticated, onRequireAuth, fetchLeaderboard]);

  const getRankStyle = (rank) => {
    if (rank === 1) return 'rank-gold';
    if (rank === 2) return 'rank-silver';
    if (rank === 3) return 'rank-bronze';
    return '';
  };

  if (loading) {
    return (
      <div className="cl-loading">
        <div className="cl-spinner"></div>
        <p>Loading leaderboard...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="cl-empty">
        <FiTrendingUp size={48} />
        <p>Sign in to view the company leaderboard</p>
      </div>
    );
  }

  return (
    <div className="company-leaderboard">
      <div className="cl-header">
        <div className="cl-header-icon"><FiAward size={32} /></div>
        <h1>Company Leaderboard</h1>
        <p>Ranked by sales, rating &amp; followers</p>
      </div>

      {leaderboard.length === 0 ? (
        <div className="cl-empty">
          <FiTrendingUp size={48} />
          <p>No companies on the leaderboard yet</p>
        </div>
      ) : (
        <div className="cl-list">
          {/* Top 3 Podium */}
          {leaderboard.length > 0 && (() => {
            const top = leaderboard.slice(0, Math.min(3, leaderboard.length));
            // Order: 2nd (left), 1st (center), 3rd (right) — adjust if fewer than 3
            const ordered = top.length === 1
              ? [top[0]]
              : top.length === 2
                ? [top[1], top[0]]
                : [top[1], top[0], top[2]];
            const medals = [
              <Award size={22} style={{ color: '#94a3b8' }} />,
              <Award size={26} style={{ color: '#f59e0b' }} />,
              <Award size={20} style={{ color: '#cd7c2e' }} />
            ];
            const classes = ['cl-podium-second', 'cl-podium-first', 'cl-podium-third'];
            // For 1 or 2 entries, centering overrides
            return (
              <div className="cl-podium">
                {ordered.map((company, idx) => {
                  const medalIdx = top.length === 1 ? 1 : top.length === 2 ? (idx === 0 ? 1 : 0) : idx;
                  return (
                    <div key={company.id} className={`cl-podium-card ${top.length === 1 ? 'cl-podium-first' : top.length === 2 ? (idx === 1 ? 'cl-podium-first' : 'cl-podium-second') : classes[idx]}`}>
                      <div className="cl-podium-medal">{medals[medalIdx]}</div>
                      <img
                        src={company.company_logo ? `${API_BASE}${company.company_logo}` : '/assets/images/default-company.svg'}
                        alt={company.company_name}
                        className="cl-podium-logo"
                        onError={(e) => { e.target.src = '/assets/images/default-company.svg'; }}
                      />
                      <h3>{company.company_name}</h3>
                      <span className="cl-podium-owner">by {company.owner_name}</span>
                      <div className="cl-podium-stats">
                        <span><ShoppingCart size={12} /> {company.total_sales || 0} sales</span>
                        <span><Star size={12} fill="currentColor" /> {parseFloat(company.rating || 0).toFixed(1)} ({company.total_ratings || 0})</span>
                        <span><Users size={12} /> {company.follower_count || 0}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Remaining companies: rank 4 onwards */}
          {leaderboard.filter(c => c.rank > 3).length > 0 && (
          <div className="cl-table">
            <div className="cl-table-header">
              <span className="cl-col-rank">Rank</span>
              <span className="cl-col-company">Company</span>
              <span className="cl-col-sales">Sales</span>
              <span className="cl-col-rating">Rating</span>
              <span className="cl-col-followers">Followers</span>
            </div>

            {leaderboard.filter(c => c.rank > 3).map((company) => (
              <div key={company.id} className={`cl-table-row ${getRankStyle(company.rank)}`}>
                <span className="cl-col-rank">
                  <span className="cl-rank-number">{company.rank}</span>
              </span>

                <span className="cl-col-company">
                  <img
                    src={company.company_logo ? `${API_BASE}${company.company_logo}` : '/assets/images/default-company.svg'}
                    alt={company.company_name}
                    className="cl-row-logo"
                    onError={(e) => { e.target.src = '/assets/images/default-company.svg'; }}
                  />
                  <div className="cl-row-info">
                    <h4>{company.company_name}</h4>
                    <span>by {company.owner_name}</span>
                  </div>
                </span>

                <span className="cl-col-sales">
                  {company.total_sales || 0}
                </span>

                <span className="cl-col-rating">
                  <Star size={12} fill="currentColor" /> {parseFloat(company.rating || 0).toFixed(1)}
                </span>

                <span className="cl-col-followers">
                  <Users size={12} /> {company.follower_count || 0}
                </span>
              </div>
            ))}
          </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompanyLeaderboard;
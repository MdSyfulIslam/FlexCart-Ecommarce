import React, { useState, useEffect, useContext, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiGift, FiClock } from 'react-icons/fi';
import { Zap, Star, Sparkles, RefreshCw } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import spinRewardService from '../../services/spinRewardService';
import { SPIN_WHEEL_SEGMENTS } from '../../utils/constants';
import { toast } from 'react-toastify';
import './SpinReward.css';

const SpinReward = () => {
  const { loadUser } = useContext(AuthContext);

  const [canSpin, setCanSpin] = useState(false);
  const [nextSpinTime, setNextSpinTime] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [reward, setReward] = useState(null);
  const [history, setHistory] = useState([]);
  const [countdown, setCountdown] = useState('');

  const checkEligibility = useCallback(async () => {
    try {
      const response = await spinRewardService.checkEligibility();
      if (response.data.success) {
        setCanSpin(response.data.data.canSpin);
        setNextSpinTime(response.data.data.nextSpinTime);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const response = await spinRewardService.getHistory();
      if (response.data.success) {
        setHistory(response.data.data);
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    checkEligibility();
    loadHistory();
  }, [checkEligibility, loadHistory]);

  // Live countdown timer
  useEffect(() => {
    if (!nextSpinTime || canSpin) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const next = new Date(nextSpinTime);
      const diff = next - now;

      if (diff <= 0) {
        setCountdown('Ready!');
        setCanSpin(true);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const pad = (n) => n.toString().padStart(2, '0');

      const nextDate = next.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      const nextTime = next.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });

      setCountdown(
        nextDate + ' at ' + nextTime + ' (' + pad(hours) + 'h ' + pad(minutes) + 'm ' + pad(seconds) + 's)'
      );
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [nextSpinTime, canSpin]);

  // ✅ Calculate exact rotation to land on correct segment
  const calculateRotation = (segmentIndex) => {
    const segmentCount = SPIN_WHEEL_SEGMENTS.length;
    const segmentAngle = 360 / segmentCount;

    // The pointer is at the TOP (0 degrees)
    // Segment 0 starts at 0 degrees
    // To land on segmentIndex, we need the middle of that segment at the top
    // Since wheel rotates clockwise, we go backwards
    const segmentMiddle = segmentIndex * segmentAngle + segmentAngle / 2;

    // Target angle: wheel must rotate so this segment is at top (under pointer)
    // Pointer is at top = 360 - segmentMiddle (to bring it to top)
    const targetAngle = 360 - segmentMiddle;

    // Add extra full rotations for dramatic effect (5-8 full spins)
    const fullSpins = (Math.floor(Math.random() * 4) + 5) * 360;

    return fullSpins + targetAngle;
  };

  const handleSpin = async () => {
    if (!canSpin || spinning) return;

    setSpinning(true);
    setReward(null);

    try {
      // ✅ Call API FIRST to get the result
      const response = await spinRewardService.spin();

      if (response.data.success) {
        const wonReward = response.data.data.reward;
        const segmentIndex = wonReward.segmentIndex;

        // ✅ Calculate exact rotation to land on the correct segment
        const targetRotation = rotation + calculateRotation(segmentIndex);
        setRotation(targetRotation);

        // Wait for wheel animation to finish (4 seconds)
        setTimeout(() => {
          setReward(wonReward);
          setSpinning(false);
          setCanSpin(false);

          loadUser();
          loadHistory();
          checkEligibility();

          if (wonReward.type === 'points') {
            toast.success('🎉 You won ' + wonReward.value + ' Points!');
          } else if (wonReward.type === 'stars') {
            toast.success('⭐ You won ' + wonReward.value + ' Stars!');
          } else if (wonReward.type === 'discount') {
            toast.success('🎟️ You won ' + wonReward.value + '% Discount!');
          } else {
            toast.info('Better luck next time! 🔄');
          }
        }, 4500);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Spin failed');
      setSpinning(false);
    }
  };

  const getRewardIcon = (type) => {
    if (type === 'points') return <Zap size={24} />;
    if (type === 'stars') return <Star size={24} fill="currentColor" />;
    if (type === 'discount') return <Sparkles size={24} />;
    return <RefreshCw size={24} />;
  };

  const getRewardText = (item) => {
    if (item.reward_type === 'points') return item.reward_value + ' Points';
    if (item.reward_type === 'stars') return item.reward_value + ' Stars';
    if (item.reward_type === 'discount') return item.reward_value + '% Discount';
    return 'Better luck next time';
  };

  const segmentCount = SPIN_WHEEL_SEGMENTS.length;
  const segmentAngle = 360 / segmentCount;

  return (
    <div className="spin-reward">
      {/* Header */}
      <div className="sr-header">
        <FiGift size={22} className="sr-header-icon" />
        <div>
          <h2 className="sr-title">Spin & Win</h2>
          <p className="sr-subtitle">Free spin every 24 hours • Win points & stars!</p>
        </div>
      </div>

      <div className="sr-center">
        {/* Wheel */}
        <div className="sr-wheel-wrapper">
          <div className="sr-pointer">
            <svg width="28" height="32" viewBox="0 0 28 32">
              <path d="M14 0L28 10L14 32L0 10Z" fill="#EF4444" stroke="white" strokeWidth="2" />
            </svg>
          </div>

          <motion.div
            className="sr-wheel"
            animate={{ rotate: rotation }}
            transition={{ duration: 4, ease: [0.2, 0.8, 0.3, 1] }}
          >
            <svg viewBox="0 0 300 300" className="sr-svg">
              {SPIN_WHEEL_SEGMENTS.map((segment, index) => {
                const startAngle = index * segmentAngle;
                const endAngle = (index + 1) * segmentAngle;

                const startRad = (startAngle - 90) * (Math.PI / 180);
                const endRad = (endAngle - 90) * (Math.PI / 180);

                const x1 = 150 + 145 * Math.cos(startRad);
                const y1 = 150 + 145 * Math.sin(startRad);
                const x2 = 150 + 145 * Math.cos(endRad);
                const y2 = 150 + 145 * Math.sin(endRad);

                const largeArc = segmentAngle > 180 ? 1 : 0;
                const pathD = `M 150 150 L ${x1} ${y1} A 145 145 0 ${largeArc} 1 ${x2} ${y2} Z`;

                const midAngle = (startAngle + endAngle) / 2;
                const midRad = (midAngle - 90) * (Math.PI / 180);
                const labelX = 150 + 100 * Math.cos(midRad);
                const labelY = 150 + 100 * Math.sin(midRad);
                const iconX = 150 + 70 * Math.cos(midRad);
                const iconY = 150 + 70 * Math.sin(midRad);

                return (
                  <g key={index}>
                    <path d={pathD} fill={segment.color} stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
                    <text x={labelX} y={labelY} fill="white" fontSize="10" fontWeight="700"
                      textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${midAngle}, ${labelX}, ${labelY})`}>
                      {segment.label}
                    </text>
                    <text x={iconX} y={iconY} fontSize="14" textAnchor="middle" dominantBaseline="middle"
                      transform={`rotate(${midAngle}, ${iconX}, ${iconY})`}>
                    {segment.type === 'points' ? <Zap size={12} style={{ display: 'inline' }} /> : segment.type === 'stars' ? <Star size={12} fill="currentColor" style={{ display: 'inline' }} /> : <RefreshCw size={12} style={{ display: 'inline' }} />}
                    </text>
                  </g>
                );
              })}
              <circle cx="150" cy="150" r="25" fill="white" stroke="#e2e8f0" strokeWidth="2" />
              <circle cx="150" cy="150" r="12" fill="var(--primary)" />
              <circle cx="150" cy="150" r="5" fill="white" />
              <circle cx="150" cy="150" r="148" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
            </svg>
          </motion.div>
        </div>

        {/* Spin Button */}
        <motion.button
          className={`sr-spin-btn ${!canSpin || spinning ? 'disabled' : ''}`}
          onClick={handleSpin}
          disabled={!canSpin || spinning}
          whileHover={canSpin && !spinning ? { scale: 1.03 } : {}}
          whileTap={canSpin && !spinning ? { scale: 0.97 } : {}}
        >
          {spinning ? (
            'Spinning...'
          ) : canSpin ? (
            'SPIN NOW!'
          ) : (
            <span className="sr-countdown-text">
              <FiClock size={16} />
              <span>Next spin: {countdown}</span>
            </span>
          )}
        </motion.button>

        {/* Result */}
        {reward && (
          <motion.div
            className="sr-result"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
          >
            <div className="sr-result-icon">
              {getRewardIcon(reward.type)}
            </div>
            <div className="sr-result-info">
              <h3>{reward.type !== 'nothing' ? <><Sparkles size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />You Won!</> : 'Try Again!'}</h3>
              <p className="sr-result-label">{reward.label}</p>
            </div>
          </motion.div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="sr-history-section">
            <h3 className="sr-history-title">
              <FiClock size={16} /> Spin History
            </h3>
            <div className="sr-history-list">
              {history.slice(0, 10).map(item => (
                <div key={item.id} className={`sr-history-item sr-history-${item.reward_type}`}>
                  <span className="sr-h-icon">{getRewardIcon(item.reward_type)}</span>
                  <div className="sr-h-info">
                    <span className="sr-h-text">{getRewardText(item)}</span>
                  </div>
                  <span className="sr-h-date">
                    {new Date(item.spun_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpinReward;
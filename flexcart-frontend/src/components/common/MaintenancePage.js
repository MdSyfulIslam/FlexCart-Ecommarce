import React, { useEffect, useState } from 'react';

/* ─── Floating particle ─────────────────────────────────────────── */
const Particle = ({ style }) => <div className="fc-particle" style={style} />;

/* ─── Gear SVG ──────────────────────────────────────────────────── */
const Gear = ({ size = 60, color = '#6366f1', speed = '6s', reverse = false, style = {} }) => (
  <svg
    width={size} height={size} viewBox="0 0 60 60" fill="none"
    style={{
      animation: `fc-spin-${reverse ? 'rev' : 'fwd'} ${speed} linear infinite`,
      ...style
    }}
  >
    <path
      fill={color}
      d="M30 20a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm16.7 6.6-2.4-.4a14.8 14.8 0 0 0-1.2-2.9l1.4-2-3.8-3.8-2 1.4a14.8 14.8 0 0 0-2.9-1.2l-.4-2.4h-5.4l-.4 2.4a14.8 14.8 0 0 0-2.9 1.2l-2-1.4-3.8 3.8 1.4 2a14.8 14.8 0 0 0-1.2 2.9l-2.4.4v5.4l2.4.4c.3 1 .7 2 1.2 2.9l-1.4 2 3.8 3.8 2-1.4c.9.5 1.9.9 2.9 1.2l.4 2.4h5.4l.4-2.4c1-.3 2-.7 2.9-1.2l2 1.4 3.8-3.8-1.4-2c.5-.9.9-1.9 1.2-2.9l2.4-.4v-5.4z"
    />
  </svg>
);

/* ─── Shopping cart bounce ──────────────────────────────────────── */
const CartIcon = () => (
  <svg
    width="90" height="90" viewBox="0 0 24 24" fill="none"
    style={{ animation: 'fc-bounce 1.4s ease-in-out infinite', filter: 'drop-shadow(0 8px 24px #6366f188)' }}
  >
    <circle cx="9" cy="21" r="1.5" fill="#a78bfa" />
    <circle cx="20" cy="21" r="1.5" fill="#a78bfa" />
    <path
      stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"
    />
    <path stroke="#c4b5fd" strokeWidth="1.4" strokeLinecap="round" d="M10 11h4M12 9v4" />
  </svg>
);

/* ─── Wrench SVG ────────────────────────────────────────────────── */
const WrenchIcon = () => (
  <svg
    width="38" height="38" viewBox="0 0 24 24" fill="none"
    style={{ animation: 'fc-wrench 2.2s ease-in-out infinite' }}
  >
    <path
      stroke="#f472b6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
    />
  </svg>
);

/* ─── Main component ────────────────────────────────────────────── */
export default function MaintenancePage() {
  const [dots, setDots] = useState('');
  const [progress, setProgress] = useState(0);

  /* Animate "Working..." dots */
  useEffect(() => {
    const id = setInterval(() => setDots(d => (d.length >= 3 ? '' : d + '.')), 500);
    return () => clearInterval(id);
  }, []);

  /* Fake indeterminate progress bar */
  useEffect(() => {
    let p = 0;
    const id = setInterval(() => {
      p += Math.random() * 3;
      if (p >= 95) p = 20; // loop back so it never finishes
      setProgress(p);
    }, 400);
    return () => clearInterval(id);
  }, []);

  /* Generate stable particles once */
  const particles = React.useMemo(() =>
    Array.from({ length: 22 }, (_, i) => ({
      id: i,
      size:  6 + (i * 7) % 12,
      left:  (i * 47 + 13) % 100,
      delay: (i * 0.37) % 5,
      dur:   5 + (i * 0.6) % 7,
      color: ['#6366f1', '#818cf8', '#a78bfa', '#c4b5fd', '#f472b6', '#34d399'][i % 6],
      shape: i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'square' : 'triangle',
    })), []);

  return (
    <>
      {/* ── Inline keyframes + styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        .fc-maint-root {
          min-height: 100vh;
          background: linear-gradient(135deg, #0f0c29 0%, #1a1040 40%, #141428 100%);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif;
          overflow: hidden; position: relative;
          padding: 2rem 1rem;
        }

        /* Stars background */
        .fc-stars {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(1px 1px at 20% 30%, #fff6 0%, transparent 100%),
            radial-gradient(1px 1px at 50% 80%, #fff4 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 75% 20%, #fff5 0%, transparent 100%),
            radial-gradient(1px 1px at 85% 60%, #fff3 0%, transparent 100%),
            radial-gradient(1px 1px at 10% 70%, #fff4 0%, transparent 100%),
            radial-gradient(1.5px 1.5px at 35% 50%, #a78bfa44 0%, transparent 100%),
            radial-gradient(1px 1px at 60% 40%, #818cf844 0%, transparent 100%);
        }

        /* Particles */
        .fc-particle {
          position: fixed; border-radius: 50%; opacity: 0;
          animation: fc-float var(--dur) ease-in var(--delay) infinite;
          pointer-events: none; z-index: 0;
        }
        @keyframes fc-float {
          0%   { transform: translateY(110vh) scale(0); opacity: 0; }
          10%  { opacity: 0.6; }
          90%  { opacity: 0.3; }
          100% { transform: translateY(-10vh) scale(1); opacity: 0; }
        }

        /* Card */
        .fc-card {
          position: relative; z-index: 1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          backdrop-filter: blur(20px);
          border-radius: 28px;
          padding: 3rem 2.5rem;
          max-width: 520px; width: 100%;
          text-align: center;
          box-shadow: 0 25px 80px rgba(99,102,241,0.2), 0 0 0 1px rgba(255,255,255,0.04);
          animation: fc-fadein 0.8s ease both;
        }
        @keyframes fc-fadein {
          from { opacity: 0; transform: translateY(30px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }

        /* Badge */
        .fc-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: rgba(99,102,241,0.18);
          border: 1px solid rgba(99,102,241,0.4);
          color: #a5b4fc; font-size: .72rem; font-weight: 600;
          letter-spacing: .12em; text-transform: uppercase;
          padding: 5px 14px; border-radius: 100px;
          margin-bottom: 1.4rem;
          animation: fc-pulse-badge 2.5s ease-in-out infinite;
        }
        @keyframes fc-pulse-badge {
          0%,100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
          50%      { box-shadow: 0 0 0 8px rgba(99,102,241,0); }
        }
        .fc-badge-dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: #6366f1;
          animation: fc-blink 1.2s ease-in-out infinite;
        }
        @keyframes fc-blink {
          0%,100% { opacity: 1; } 50% { opacity: 0.2; }
        }

        /* Icon row */
        .fc-icon-row {
          display: flex; align-items: center; justify-content: center;
          gap: 16px; margin: 1.2rem 0;
        }

        /* Headline */
        .fc-title {
          font-size: 2rem; font-weight: 800; line-height: 1.2;
          background: linear-gradient(135deg, #e0e7ff 0%, #a78bfa 50%, #f472b6 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 .75rem;
        }
        .fc-subtitle {
          color: #94a3b8; font-size: .95rem; line-height: 1.6;
          margin: 0 0 2rem;
        }

        /* Progress bar */
        .fc-progress-wrap {
          background: rgba(255,255,255,0.07);
          border-radius: 100px; height: 6px;
          overflow: hidden; margin-bottom: 2rem;
          position: relative;
        }
        .fc-progress-bar {
          height: 100%; border-radius: 100px;
          background: linear-gradient(90deg, #6366f1, #a78bfa, #f472b6);
          transition: width 0.4s ease;
          position: relative;
        }
        .fc-progress-bar::after {
          content: '';
          position: absolute; right: 0; top: 0; bottom: 0;
          width: 40px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5));
          border-radius: 100px;
          animation: fc-shimmer 1s linear infinite;
        }
        @keyframes fc-shimmer {
          from { transform: translateX(-100%); }
          to   { transform: translateX(100%); }
        }

        /* Status items */
        .fc-status-row {
          display: flex; flex-direction: column; gap: 10px;
          margin-bottom: 2rem; text-align: left;
        }
        .fc-status-item {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 12px; padding: 10px 14px;
          font-size: .85rem; color: #94a3b8;
        }
        .fc-status-icon {
          width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: .85rem; flex-shrink: 0;
        }
        .fc-status-item.done .fc-status-icon { background: rgba(52,211,153,0.15); }
        .fc-status-item.wip  .fc-status-icon { background: rgba(251,191,36,0.15); animation: fc-spin-fwd 2s linear infinite; }
        .fc-status-item.wait .fc-status-icon { background: rgba(99,102,241,0.15); }
        .fc-status-item.done { color: #6ee7b7; border-color: rgba(52,211,153,0.15); }
        .fc-status-item.wip  { color: #fde68a; border-color: rgba(251,191,36,0.15);  }

        /* Working text */
        .fc-working {
          font-size: .8rem; color: #64748b; margin-bottom: 1.8rem;
          font-variant-numeric: tabular-nums;
        }
        .fc-working span { color: #818cf8; font-weight: 600; }

        /* Logo */
        .fc-logo {
          font-size: 1.3rem; font-weight: 800; color: #e0e7ff;
          display: flex; align-items: center; justify-content: center;
          gap: 8px; margin-bottom: 1.8rem;
        }
        .fc-logo-icon {
          background: linear-gradient(135deg, #6366f1, #a78bfa);
          border-radius: 10px; padding: 6px 9px;
          font-size: 1.1rem; line-height: 1;
        }

        /* Footer */
        .fc-footer {
          font-size: .75rem; color: #475569; margin-top: .5rem;
        }
        .fc-footer a { color: #818cf8; text-decoration: none; }

        /* Keyframes */
        @keyframes fc-spin-fwd { to { transform: rotate(360deg);  } }
        @keyframes fc-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes fc-bounce {
          0%,100% { transform: translateY(0);    }
          50%      { transform: translateY(-14px); }
        }
        @keyframes fc-wrench {
          0%,100% { transform: rotate(-20deg); }
          50%      { transform: rotate(30deg);  }
        }

        @media (max-width: 480px) {
          .fc-card { padding: 2rem 1.4rem; }
          .fc-title { font-size: 1.6rem; }
        }
      `}</style>

      <div className="fc-maint-root">
        {/* Stars */}
        <div className="fc-stars" />

        {/* Floating particles */}
        {particles.map(p => (
          <Particle
            key={p.id}
            style={{
              width: p.size, height: p.size,
              left: `${p.left}%`,
              background: p.color,
              borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'square' ? '3px' : '50%',
              '--dur':   `${p.dur}s`,
              '--delay': `${p.delay}s`,
            }}
          />
        ))}

        {/* Card */}
        <div className="fc-card">

          {/* Logo */}
          <div className="fc-logo">
            <span className="fc-logo-icon">🛒</span>
            FlexCart
          </div>

          {/* Badge */}
          <div className="fc-badge">
            <span className="fc-badge-dot" />
            Scheduled Maintenance
          </div>

          {/* Animated icons */}
          <div className="fc-icon-row">
            <Gear size={40} color="#6366f1" speed="8s" style={{ opacity: 0.7 }} />
            <CartIcon />
            <Gear size={32} color="#a78bfa" speed="5s" reverse style={{ opacity: 0.7 }} />
          </div>

          {/* Title */}
          <h1 className="fc-title">We're upgrading<br />for you!</h1>
          <p className="fc-subtitle">
            Our team is working hard to bring you an even better
            shopping experience. We'll be back shortly!
          </p>

          {/* Progress bar */}
          <div className="fc-progress-wrap">
            <div className="fc-progress-bar" style={{ width: `${progress}%` }} />
          </div>

          {/* Status checklist */}
          <div className="fc-status-row">
            <div className="fc-status-item done">
              <div className="fc-status-icon">✅</div>
              <span>Database optimisation — completed</span>
            </div>
            <div className="fc-status-item wip">
              <div className="fc-status-icon">⚙️</div>
              <span>Deploying new features — in progress</span>
            </div>
            <div className="fc-status-item wait">
              <div className="fc-status-icon">🔒</div>
              <span>Security patches — queued</span>
            </div>
          </div>

          {/* Working dots */}
          <p className="fc-working">
            <WrenchIcon />
            <span>Working{dots}</span> — estimated downtime: a few minutes
          </p>

          <p className="fc-footer">
            Questions? Reach us at&nbsp;
            <a href="mailto:support@flexcart.com">support@flexcart.com</a>
          </p>
        </div>
      </div>
    </>
  );
}

import React, { useEffect, useState, useRef } from 'react';
import api from '../../services/api';
import { getImageUrl } from '../../utils/helpers';
import './AdBanner.css';

const AUTO_SCROLL_INTERVAL = 5000; // 5 seconds per ad

const AdBanner = () => {
  const [ads, setAds] = useState([]);
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    api.get('/ads').then(res => {
      if (res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setAds(res.data.data);
      }
    }).catch(() => {});
  }, []);

  // Auto-slide
  useEffect(() => {
    if (ads.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent(prev => (prev + 1) % ads.length);
    }, AUTO_SCROLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [ads.length]);

  if (ads.length === 0) return null;

  const ad = ads[current];

  const handleClick = () => {
    if (ad.link_url) {
      window.open(ad.link_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="ad-banner-wrapper">
      <div
        className={`ad-banner${ad.link_url ? ' ad-banner--clickable' : ''}`}
        onClick={handleClick}
        role={ad.link_url ? 'link' : undefined}
        aria-label={ad.link_url ? `Ad: ${ad.advertiser_name}` : undefined}
      >
        {ad.banner_image ? (
          <img
            className="ad-banner__img"
            src={getImageUrl(ad.banner_image)}
            alt={ad.advertiser_name}
            loading="lazy"
          />
        ) : (
          <div className="ad-banner__text-only">
            <span className="ad-banner__label">Ad</span>
            <span className="ad-banner__name">{ad.advertiser_name}</span>
          </div>
        )}

        <span className="ad-banner__badge">Ad</span>
      </div>

      {ads.length > 1 && (
        <div className="ad-banner-dots">
          {ads.map((_, i) => (
            <button
              key={i}
              className={`ad-banner-dot${i === current ? ' ad-banner-dot--active' : ''}`}
              onClick={() => { setCurrent(i); clearInterval(intervalRef.current); }}
              aria-label={`Ad ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdBanner;

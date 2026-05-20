import React from 'react';
import './AnimatedBackground.css';

var AnimatedBackground = function (props) {
  var theme = props.theme;
  if (!theme) return null;

  var renderTheme = function () {
    switch (theme) {
      case 'forest':
        return (
          <div className="rain-container">
            {Array.from({ length: 80 }, function (_, i) {
              return React.createElement('div', {
                key: 'r' + i,
                className: 'raindrop',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 2 + 's',
                  animationDuration: 0.5 + Math.random() * 0.3 + 's',
                  opacity: 0.15 + Math.random() * 0.3,
                  height: 15 + Math.random() * 20 + 'px'
                }
              });
            })}
            {Array.from({ length: 15 }, function (_, i) {
              return React.createElement('div', {
                key: 'sp' + i,
                className: 'rain-splash',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 3 + 's',
                  animationDuration: 0.8 + Math.random() * 0.5 + 's'
                }
              });
            })}
            <div className="rain-fog rain-fog-1" />
            <div className="rain-fog rain-fog-2" />
            <div className="rain-fog rain-fog-3" />
            <div className="lightning" />
          </div>
        );

      case 'rain':
        return (
          <div className="heavy-rain-container">
            {Array.from({ length: 120 }, function (_, i) {
              return React.createElement('div', {
                key: 'hr' + i,
                className: 'heavy-raindrop',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 1.5 + 's',
                  animationDuration: 0.3 + Math.random() * 0.2 + 's',
                  opacity: 0.2 + Math.random() * 0.4
                }
              });
            })}
            <div className="rain-ground-mist" />
          </div>
        );

      case 'ocean':
        return (
          <div className="ocean-container">
            <div className="ocean-wave ocean-wave-1" />
            <div className="ocean-wave ocean-wave-2" />
            <div className="ocean-wave ocean-wave-3" />
            <div className="ocean-wave ocean-wave-4" />
            <div className="ocean-foam" />
            {Array.from({ length: 20 }, function (_, i) {
              return React.createElement('div', {
                key: 'b' + i,
                className: 'bubble',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 8 + 's',
                  animationDuration: 4 + Math.random() * 6 + 's',
                  width: 4 + Math.random() * 10 + 'px',
                  height: 4 + Math.random() * 10 + 'px',
                  opacity: 0.15 + Math.random() * 0.25
                }
              });
            })}
            {Array.from({ length: 5 }, function (_, i) {
              return React.createElement('div', {
                key: 'lr' + i,
                className: 'light-ray',
                style: {
                  left: 10 + i * 20 + '%',
                  animationDelay: i * 1.5 + 's',
                  animationDuration: 4 + Math.random() * 3 + 's'
                }
              });
            })}
          </div>
        );

      case 'beach':
        return (
          <div className="beach-container">
            <div className="beach-sun" />
            <div className="beach-sun-glow" />
            {Array.from({ length: 4 }, function (_, i) {
              return React.createElement('div', {
                key: 'bc' + i,
                className: 'beach-cloud',
                style: {
                  top: 5 + i * 8 + '%',
                  animationDelay: i * 5 + 's',
                  animationDuration: 30 + Math.random() * 20 + 's',
                  opacity: 0.6 + Math.random() * 0.3
                }
              });
            })}
            <div className="beach-sea">
              <div className="beach-wave beach-wave-1" />
              <div className="beach-wave beach-wave-2" />
              <div className="beach-wave beach-wave-3" />
              <div className="beach-foam-line beach-foam-1" />
              <div className="beach-foam-line beach-foam-2" />
            </div>
            <div className="beach-sand" />
            {Array.from({ length: 20 }, function (_, i) {
              return React.createElement('div', {
                key: 'ss' + i,
                className: 'sand-sparkle',
                style: {
                  left: Math.random() * 100 + '%',
                  bottom: Math.random() * 12 + '%',
                  animationDelay: Math.random() * 5 + 's',
                  animationDuration: 1.5 + Math.random() * 2 + 's'
                }
              });
            })}
            {Array.from({ length: 3 }, function (_, i) {
              return React.createElement('div', {
                key: 'sg' + i,
                className: 'seagull',
                style: {
                  top: 10 + Math.random() * 20 + '%',
                  animationDelay: i * 4 + 's',
                  animationDuration: 12 + Math.random() * 8 + 's'
                }
              });
            })}
          </div>
        );

      case 'starry':
        return (
          <div className="starry-container">
            {Array.from({ length: 100 }, function (_, i) {
              return React.createElement('div', {
                key: 's' + i,
                className: 'star',
                style: {
                  left: Math.random() * 100 + '%',
                  top: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 5 + 's',
                  animationDuration: 2 + Math.random() * 4 + 's',
                  width: 1 + Math.random() * 3 + 'px',
                  height: 1 + Math.random() * 3 + 'px'
                }
              });
            })}
            {Array.from({ length: 4 }, function (_, i) {
              return React.createElement('div', {
                key: 'sh' + i,
                className: 'shooting-star',
                style: {
                  top: 10 + Math.random() * 40 + '%',
                  left: Math.random() * 60 + '%',
                  animationDelay: i * 4 + Math.random() * 2 + 's'
                }
              });
            })}
            <div className="nebula nebula-1" />
            <div className="nebula nebula-2" />
          </div>
        );

      case 'aurora':
        return (
          <div className="aurora-container">
            <div className="aurora-band aurora-band-1" />
            <div className="aurora-band aurora-band-2" />
            <div className="aurora-band aurora-band-3" />
            <div className="aurora-band aurora-band-4" />
            {Array.from({ length: 60 }, function (_, i) {
              return React.createElement('div', {
                key: 'as' + i,
                className: 'aurora-star',
                style: {
                  left: Math.random() * 100 + '%',
                  top: Math.random() * 60 + '%',
                  animationDelay: Math.random() * 4 + 's',
                  animationDuration: 2 + Math.random() * 3 + 's',
                  width: 1 + Math.random() * 2 + 'px',
                  height: 1 + Math.random() * 2 + 'px'
                }
              });
            })}
            <div className="aurora-ground-glow" />
          </div>
        );

      case 'snow':
        return (
          <div className="snow-container">
            {Array.from({ length: 60 }, function (_, i) {
              return React.createElement('div', {
                key: 'sf' + i,
                className: 'snowflake',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 10 + 's',
                  animationDuration: 6 + Math.random() * 10 + 's',
                  width: 2 + Math.random() * 8 + 'px',
                  height: 2 + Math.random() * 8 + 'px',
                  opacity: 0.3 + Math.random() * 0.6
                }
              });
            })}
            <div className="snow-wind snow-wind-1" />
            <div className="snow-wind snow-wind-2" />
            <div className="snow-ground" />
          </div>
        );

      case 'sunset':
        return (
          <div className="sunset-container">
            <div className="sunset-sun" />
            <div className="sunset-reflection" />
            {Array.from({ length: 6 }, function (_, i) {
              return React.createElement('div', {
                key: 'sc' + i,
                className: 'sunset-cloud',
                style: {
                  top: 10 + i * 10 + '%',
                  animationDelay: i * 3 + 's',
                  animationDuration: 25 + Math.random() * 20 + 's',
                  opacity: 0.4 + Math.random() * 0.3,
                  height: 20 + Math.random() * 30 + 'px',
                  width: 150 + Math.random() * 150 + 'px'
                }
              });
            })}
            {Array.from({ length: 5 }, function (_, i) {
              return React.createElement('div', {
                key: 'sb' + i,
                className: 'sunset-bird',
                style: {
                  top: 20 + Math.random() * 25 + '%',
                  animationDelay: i * 2 + 's',
                  animationDuration: 10 + Math.random() * 8 + 's'
                }
              });
            })}
          </div>
        );

      case 'city':
        return (
          <div className="city-container">
            {Array.from({ length: 40 }, function (_, i) {
              var colors = ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0', '#f77f00', '#FFFFFF'];
              return React.createElement('div', {
                key: 'cl' + i,
                className: 'city-light',
                style: {
                  left: Math.random() * 100 + '%',
                  top: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 4 + 's',
                  animationDuration: 1.5 + Math.random() * 3 + 's',
                  width: 2 + Math.random() * 6 + 'px',
                  height: 2 + Math.random() * 6 + 'px',
                  background: colors[Math.floor(Math.random() * colors.length)]
                }
              });
            })}
            <div className="city-glow city-glow-1" />
            <div className="city-glow city-glow-2" />
            {Array.from({ length: 4 }, function (_, i) {
              return React.createElement('div', {
                key: 'car' + i,
                className: 'city-car',
                style: {
                  bottom: 5 + i * 8 + '%',
                  animationDelay: i * 3 + 's',
                  animationDuration: 6 + Math.random() * 4 + 's'
                }
              });
            })}
          </div>
        );

      case 'underwater':
        return (
          <div className="underwater-container">
            {Array.from({ length: 6 }, function (_, i) {
              return React.createElement('div', {
                key: 'uwr' + i,
                className: 'uw-light-ray',
                style: {
                  left: 5 + i * 18 + '%',
                  animationDelay: i * 0.8 + 's',
                  animationDuration: 3 + Math.random() * 2 + 's'
                }
              });
            })}
            {Array.from({ length: 25 }, function (_, i) {
              return React.createElement('div', {
                key: 'uwb' + i,
                className: 'uw-bubble',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 8 + 's',
                  animationDuration: 4 + Math.random() * 6 + 's',
                  width: 3 + Math.random() * 12 + 'px',
                  height: 3 + Math.random() * 12 + 'px'
                }
              });
            })}
            {Array.from({ length: 5 }, function (_, i) {
              return React.createElement('div', {
                key: 'uwf' + i,
                className: 'uw-fish',
                style: {
                  top: 20 + Math.random() * 50 + '%',
                  animationDelay: i * 3 + 's',
                  animationDuration: 8 + Math.random() * 6 + 's'
                }
              });
            })}
            {Array.from({ length: 8 }, function (_, i) {
              return React.createElement('div', {
                key: 'uws' + i,
                className: 'uw-seaweed',
                style: {
                  left: 5 + i * 13 + '%',
                  animationDelay: i * 0.5 + 's',
                  height: 60 + Math.random() * 80 + 'px'
                }
              });
            })}
            <div className="uw-surface-light" />
          </div>
        );

      case 'fireflies':
        return (
          <div className="firefly-container">
            {Array.from({ length: 25 }, function (_, i) {
              return React.createElement('div', {
                key: 'ff' + i,
                className: 'firefly',
                style: {
                  left: Math.random() * 100 + '%',
                  top: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 8 + 's',
                  animationDuration: 6 + Math.random() * 8 + 's'
                }
              }, React.createElement('div', { className: 'firefly-glow' }));
            })}
            <div className="firefly-grass" />
            <div className="firefly-fog" />
          </div>
        );

      case 'sakura':
        return (
          <div className="sakura-container">
            {Array.from({ length: 35 }, function (_, i) {
              return React.createElement('div', {
                key: 'sp' + i,
                className: 'sakura-petal',
                style: {
                  left: Math.random() * 100 + '%',
                  animationDelay: Math.random() * 10 + 's',
                  animationDuration: 6 + Math.random() * 8 + 's',
                  width: 6 + Math.random() * 8 + 'px',
                  height: 6 + Math.random() * 8 + 'px',
                  opacity: 0.4 + Math.random() * 0.5
                }
              });
            })}
            <div className="sakura-branch sakura-branch-1" />
            <div className="sakura-branch sakura-branch-2" />
            <div className="sakura-light" />
          </div>
        );

      case 'mountain':
        return (
          <div className="mountain-container">
            <div className="mountain-fog mountain-fog-1" />
            <div className="mountain-fog mountain-fog-2" />
            <div className="mountain-fog mountain-fog-3" />
            {Array.from({ length: 8 }, function (_, i) {
              return React.createElement('div', {
                key: 'mb' + i,
                className: 'mountain-bird',
                style: {
                  top: 15 + Math.random() * 30 + '%',
                  animationDelay: i * 1.5 + 's',
                  animationDuration: 8 + Math.random() * 6 + 's'
                }
              });
            })}
          </div>
        );

      case 'waterfall':
        return (
          <div className="waterfall-container">
            <div className="waterfall-stream" />
            <div className="waterfall-stream waterfall-stream-2" />
            {Array.from({ length: 30 }, function (_, i) {
              return React.createElement('div', {
                key: 'wm' + i,
                className: 'waterfall-mist',
                style: {
                  left: 40 + Math.random() * 20 + '%',
                  animationDelay: Math.random() * 4 + 's',
                  animationDuration: 2 + Math.random() * 3 + 's',
                  width: 3 + Math.random() * 6 + 'px',
                  height: 3 + Math.random() * 6 + 'px'
                }
              });
            })}
            <div className="waterfall-pool" />
            <div className="waterfall-rocks" />
          </div>
        );

      case 'clouds':
        return (
          <div className="clouds-container">
            {Array.from({ length: 8 }, function (_, i) {
              return React.createElement('div', {
                key: 'cld' + i,
                className: 'floating-cloud',
                style: {
                  top: 10 + Math.random() * 60 + '%',
                  animationDelay: i * 4 + 's',
                  animationDuration: 20 + Math.random() * 25 + 's',
                  opacity: 0.4 + Math.random() * 0.4,
                  transform: 'scale(' + (0.5 + Math.random() * 1) + ')'
                }
              });
            })}
            <div className="clouds-sun-glow" />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={'animated-bg animated-bg-' + theme}>
      {renderTheme()}
    </div>
  );
};

export default AnimatedBackground;
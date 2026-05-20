const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://flex-cart-main.onrender.com',
      changeOrigin: true,
      secure: true,
    })
  );
};

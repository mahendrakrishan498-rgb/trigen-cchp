module.exports = function errorHandler(err, req, res, next) {
  console.error('Backend error:', err);

  // If PDF/file response already started, do not try to send JSON again
  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
};
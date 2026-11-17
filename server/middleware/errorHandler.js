/**
 * Async wrapper — eliminates try/catch boilerplate in route handlers.
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Global Express error handler — must be registered last.
 */
export const errorHandler = (err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join('. ') });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({ message: `${field} is already taken.` });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format.' });
  }

  // Default
  res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong. Please try again.',
  });
};

/**
 * 404 handler — for unmatched routes.
 */
export const notFound = (req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found.` });
};
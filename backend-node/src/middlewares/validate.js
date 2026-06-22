export const validateSchema = (schema) => (req, res, next) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (error) {
    const issues = error.issues || error.errors || [];
    return res.status(400).json({
      error: "Validation Error",
      details: issues.map(err => ({ path: err.path ? err.path.join('.') : 'unknown', message: err.message }))
    });
  }
};

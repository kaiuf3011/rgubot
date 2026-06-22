import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-key') {
  throw new Error('FATAL: JWT_SECRET environment variable is missing in production');
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.user = user;
    next();
  });
}

export function generateToken(userPayload) {
  return jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' });
}

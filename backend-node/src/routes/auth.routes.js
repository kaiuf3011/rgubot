import express from 'express';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middlewares/auth.js';
import { validateSchema } from '../middlewares/validate.js';
import { loginRateLimiter } from '../middlewares/rateLimit.js';
import { loginRequestSchema } from '../schemas/chat.schema.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * @swagger
 * /login:
 *   post:
 *     summary: Authenticate and get a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: JWT token
 *       401:
 *         description: Unauthorized
 *       503:
 *         description: Auth not configured
 */

// Credentials are read from environment variables.
// ADMIN_USERNAME: the allowed username (default: admin for dev only)
// ADMIN_PASS_HASH: a bcrypt hash of the password.
//
// To generate a hash for a new password, run (ESM-compatible):
//   node -e "import('bcrypt').then(b => b.default.hash('yourpassword', 12).then(console.log))"
//
// Example .env:
//   ADMIN_USERNAME=admin
//   ADMIN_PASS_HASH=$2b$12$...your_bcrypt_hash...

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASS_HASH = process.env.ADMIN_PASS_HASH;

if (!ADMIN_USERNAME || !ADMIN_PASS_HASH) {
  logger.warn(
    'ADMIN_USERNAME or ADMIN_PASS_HASH env vars are not set. The /login endpoint will reject all requests until configured.'
  );
}

router.post('/', loginRateLimiter, validateSchema(loginRequestSchema), async (req, res) => {
  const { username, password } = req.body;

  // Always run bcrypt.compare() regardless of whether the username matches.
  // An early-exit on username mismatch leaks a timing signal: an attacker who
  // gets a <1ms response knows the username is wrong, while a ~100ms response
  // reveals the username was valid (bcrypt ran). By always hashing, both cases
  // take the same time, eliminating the side-channel.
  //
  // If credentials are not configured, compare against a dummy hash so timing
  // is still consistent (bcrypt runs, then we reject).
  const hashToCompare = ADMIN_PASS_HASH || '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const isPasswordValid = await bcrypt.compare(password, hashToCompare);

  // Reject if credentials are not configured, username doesn't match, or
  // password is wrong — all with the same generic error message.
  const isUsernameValid = ADMIN_USERNAME && username === ADMIN_USERNAME;

  if (!isUsernameValid || !isPasswordValid) {
    logger.warn({ username }, 'Failed login attempt');
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken({ id: username, username });
  logger.info({ username }, 'User logged in successfully');
  return res.json({ token });
});

export default router;

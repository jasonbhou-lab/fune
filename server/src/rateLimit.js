import rateLimit from "express-rate-limit";

// Sign-in/sign-up brute-force protection is now handled by Supabase Auth
// itself (it's the direct frontend->Supabase path, not through this server).

export const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests submitted from this connection. Try again later." },
});

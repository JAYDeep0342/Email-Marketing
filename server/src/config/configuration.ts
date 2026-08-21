// export default () => ({
//   env: process.env.NODE_ENV,
//   port: parseInt(process.env.PORT ?? '3000', 10),

//   database: {
//     host: process.env.DB_HOST,
//     port: parseInt(process.env.DB_PORT ?? '5432', 10),
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     name: process.env.DB_NAME,
//   },

//   jwt: {
//     accessSecret: process.env.JWT_ACCESS_SECRET,
//     accessExpires: process.env.JWT_ACCESS_EXPIRES,
//     refreshSecret: process.env.JWT_REFRESH_SECRET,
//     refreshExpires: process.env.JWT_REFRESH_EXPIRES,
//   },

//   redis: {
//     host: process.env.REDIS_HOST,
//     port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
//   },
// });

export default () => ({
  env: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),

  // Public base URL used to build links inside emails (unsubscribe, etc.).
  // No fallback here on purpose — Joi (env.validation.ts) requires these at
  // startup, so a missing value fails fast instead of silently resolving to
  // a local URL in some other environment.
  app: {
    publicUrl: process.env.APP_PUBLIC_URL,
    // Frontend origin — auth emails (verify/reset) link here, not publicUrl,
    // since those are React Router pages, not API routes.
    frontendUrl: process.env.FRONTEND_URL,
    // Parsed from comma-separated CORS_ORIGINS (BUG #5), e.g.
    // "http://localhost:5173,https://app.example.com".
    corsOrigins: (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES,
  },

  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },

  // Outbound email transport. transport=log logs instead of sending (dev default).
  mail: {
    transport: process.env.MAIL_TRANSPORT ?? 'log', // 'log' | 'smtp'
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT ?? '587', 10),
    secure: process.env.MAIL_SECURE === 'true',
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },

  // Symmetric key for encrypting provider credentials at rest.
  encryptionKey: process.env.ENCRYPTION_KEY,

  // Rate limiting (BUG #2). 'default' applies globally; auth/forms are
  // tighter overrides applied per-route via @Throttle() on the specific
  // handlers (signup, login, public form submit).
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
    authTtlMs: parseInt(process.env.AUTH_THROTTLE_TTL_MS ?? '60000', 10),
    authLimit: parseInt(process.env.AUTH_THROTTLE_LIMIT ?? '5', 10),
    formsTtlMs: parseInt(process.env.FORMS_THROTTLE_TTL_MS ?? '60000', 10),
    formsLimit: parseInt(process.env.FORMS_THROTTLE_LIMIT ?? '10', 10),
  },

  // Razorpay. All undefined when unset — RazorpayService.getCreds() treats
  // any missing field as "not configured" and throws the same
  // ServiceUnavailableException it always has.
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    // Malformed JSON must not crash config loading — fall back to {},
    // which just means no plan resolves and checkout 400s as it already does.
    planMap: ((): Record<string, string> => {
      try {
        return JSON.parse(process.env.RAZORPAY_PLAN_MAP ?? '{}');
      } catch {
        return {};
      }
    })(),
  },
});

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
  app: {
    publicUrl: process.env.APP_PUBLIC_URL ?? 'http://localhost:3000/api',
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
});

// import * as Joi from 'joi';
// export const envValidationSchema = Joi.object({
//   NODE_ENV: Joi.string()
//     .valid('development', 'production', 'test')
//     .default('development'),
//   PORT: Joi.number().default(3000),

//   // Database
//   DB_HOST: Joi.string().required(),
//   DB_PORT: Joi.number().default(5432),
//   APP_DATABASE_URL: Joi.string().required(),
//   DB_USER: Joi.string().required(),
//   DB_PASSWORD: Joi.string().required(),
//   DB_NAME: Joi.string().required(),
//   DATABASE_URL: Joi.string().required(),

//   // JWT
//   JWT_ACCESS_SECRET: Joi.string().min(32).required(),
//   JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
//   JWT_REFRESH_SECRET: Joi.string().min(32).required(),
//   JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

//   // Redis
//   REDIS_HOST: Joi.string().default('localhost'),
//   REDIS_PORT: Joi.number().default(6379),
// });
import * as Joi from 'joi';
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),

  // App
  APP_PUBLIC_URL: Joi.string().uri().default('http://localhost:3000/api'),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  APP_DATABASE_URL: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DATABASE_URL: Joi.string().required(),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

  // Redis
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // Mail (Sending Engine)
  MAIL_TRANSPORT: Joi.string().valid('log', 'smtp').default('log'),
  MAIL_HOST: Joi.string().when('MAIL_TRANSPORT', {
    is: 'smtp',
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  MAIL_PORT: Joi.number().default(587),
  MAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_USER: Joi.string().optional(),
  MAIL_PASS: Joi.string().optional(),

  // Credential encryption (Sending Engine)
  ENCRYPTION_KEY: Joi.string().min(16).required(),

  // Tracking (Step 13)
  // Signs open/click tokens. Falls back to ENCRYPTION_KEY in code if unset, but
  // set a distinct one in production.
  TRACKING_SECRET: Joi.string().min(16).optional(),
  // Guards the dev webhook simulator. In production it is OFF unless explicitly
  // set to 'true' (do NOT enable in prod).
  SIMULATOR_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
});

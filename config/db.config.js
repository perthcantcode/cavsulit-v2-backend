const { Sequelize } = require('sequelize');
require('dotenv').config();

function buildSequelize() {
  const useSsl = process.env.DB_SSL !== 'false';

  const common = {
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 60000,
      idle: 10000,
    },
    dialectOptions: useSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : {},
  };

  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, {
      ...common,
      dialectOptions: {
        ...common.dialectOptions,
        ssl: useSsl ? { require: true, rejectUnauthorized: false } : false,
      },
    });
  }

  return new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      ...common,
    },
  );
}

const sequelize = buildSequelize();

sequelize
  .authenticate()
  .then(() => console.log('✅ PostgreSQL connected'))
  .catch((err) => console.error('❌ DB error:', err.message));

module.exports = { sequelize };

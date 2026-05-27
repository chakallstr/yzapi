// Set test env vars before anything loads
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-long!";
process.env.KDV_RATE = "0.20";
process.env.APP_BASE_URL = "http://localhost:4567";
process.env.CLOSEROUTER_API_KEY = "closerouter_test_key";
process.env.CLOSEROUTER_BASE_URL = "https://api.closerouter.dev/v1";

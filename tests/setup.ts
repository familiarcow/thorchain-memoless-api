// Jest setup file for global test configuration
import 'dotenv/config';

// Set longer timeout for integration tests
jest.setTimeout(30000);

// Global test setup
beforeAll(() => {
  console.log('🧪 Starting THORChain Memoless API Test Suite');
});

afterAll(() => {
  console.log('✅ THORChain Memoless API Test Suite Completed');
});
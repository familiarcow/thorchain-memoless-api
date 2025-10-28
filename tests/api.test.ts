import request from 'supertest';
import { MemolessApiApplication } from '../src/app';

describe('THORChain Memoless API Integration Tests', () => {
  let app: MemolessApiApplication;
  let server: any;
  let registrationData: any = {};

  // Test configuration
  const TEST_ASSETS = {
    BTC: 'BTC.BTC',
    ATOM: 'GAIA.ATOM'
  };

  const TEST_MEMOS = {
    VALID_DONATE: 'DONATE:BTC.BTC',
    VALID_ATOM_DONATE: 'DONATE:GAIA.ATOM',
    INVALID: 'test-wrong-memo'
  };

  beforeAll(async () => {
    // Set a test port to avoid conflicts
    process.env.PORT = '0'; // Let OS choose an available port
    
    // Initialize the application
    app = new MemolessApiApplication();
    await app.initialize();
    server = await app.start();
    
    // Wait a moment for server to fully start
    await new Promise(resolve => setTimeout(resolve, 2000));
  }, 120000);

  afterAll(async () => {
    if (server) {
      server.close();
    }
  }, 10000);

  describe('1. Invalid Memo Registration', () => {
    test('should fail to register memo with wrong memo format', async () => {
      const response = await request(server)
        .post('/api/v1/register')
        .send({
          asset: TEST_ASSETS.BTC,
          memo: TEST_MEMOS.INVALID
        })
        .expect(500); // Registration fails at THORChain level, returns 500

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('REGISTRATION_FAILED');
      expect(response.body.error.message).toContain('Failed to register memo');
      expect(response.body.error.details).toBeDefined();
    });
  });

  describe('2. BTC.BTC Registration and Tests', () => {
    let btcRegistration: any;
    let minimumAmount: string;

    test('should successfully register BTC.BTC memo', async () => {
      const response = await request(server)
        .post('/api/v1/register')
        .send({
          asset: TEST_ASSETS.BTC,
          memo: TEST_MEMOS.VALID_DONATE
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.internal_api_id).toBeDefined();
      expect(response.body.asset).toBe(TEST_ASSETS.BTC);
      expect(response.body.memo).toBe(TEST_MEMOS.VALID_DONATE);
      expect(response.body.reference).toBeDefined();
      expect(response.body.minimum_amount_to_send).toBeDefined();

      btcRegistration = response.body;
      minimumAmount = response.body.minimum_amount_to_send;
      
      // Store for other tests
      registrationData.btc = btcRegistration;
    });

    test('should pass preflight check using internal_api_id only', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          internal_api_id: btcRegistration.internal_api_id,
          amount: minimumAmount
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('proceed');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.current_uses).toBeDefined();
      expect(response.body.data.max_uses).toBeDefined();
      expect(response.body.data.inbound_address).toBeDefined();
      expect(response.body.data.qr_code).toBeDefined();
      expect(response.body.data.blocks_remaining).toBeDefined();
      expect(response.body.data.seconds_remaining).toBeDefined();
    });

    test('should pass preflight check using asset & reference ID', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          asset: btcRegistration.asset,
          reference: btcRegistration.reference,
          amount: minimumAmount
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('proceed');
      expect(response.body.data.inbound_address).toBeDefined();
      expect(response.body.data.qr_code).toBeDefined();
    });

    test('should fail preflight check using wrong asset & correct reference ID', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          asset: TEST_ASSETS.ATOM, // Wrong asset
          reference: btcRegistration.reference,
          amount: minimumAmount
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBeDefined();
    });

    test('should fail preflight check using correct asset & wrong amount (1.00000000)', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          asset: btcRegistration.asset,
          reference: btcRegistration.reference,
          amount: '1.00000000' // Wrong amount that doesn't contain reference ID
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('validation failed');
    });
  });

  describe('3. GAIA.ATOM Registration and Tests (Different Decimals)', () => {
    let atomRegistration: any;
    let minimumAmount: string;

    test('should successfully register GAIA.ATOM memo', async () => {
      const response = await request(server)
        .post('/api/v1/register')
        .send({
          asset: TEST_ASSETS.ATOM,
          memo: TEST_MEMOS.VALID_ATOM_DONATE
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.internal_api_id).toBeDefined();
      expect(response.body.asset).toBe(TEST_ASSETS.ATOM);
      expect(response.body.memo).toBe(TEST_MEMOS.VALID_ATOM_DONATE);
      expect(response.body.reference).toBeDefined();
      expect(response.body.minimum_amount_to_send).toBeDefined();
      expect(response.body.decimals).toBeDefined();

      // GAIA.ATOM should have different decimals than BTC.BTC (6 vs 8)
      expect(response.body.decimals).not.toBe(registrationData.btc.decimals);

      atomRegistration = response.body;
      minimumAmount = response.body.minimum_amount_to_send;
      
      // Store for comparison
      registrationData.atom = atomRegistration;
    });

    test('should pass preflight check using internal_api_id only (ATOM)', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          internal_api_id: atomRegistration.internal_api_id,
          amount: minimumAmount
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('proceed');
      expect(response.body.data.inbound_address).toBeDefined();
      expect(response.body.data.qr_code).toBeDefined();
      expect(response.body.data.seconds_remaining).toBeDefined();
    });

    test('should pass preflight check using asset & reference ID (ATOM)', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          asset: atomRegistration.asset,
          reference: atomRegistration.reference,
          amount: minimumAmount
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.inbound_address).toBeDefined();
      expect(response.body.data.qr_code).toBeDefined();
    });


    test('should fail preflight check using correct asset & wrong amount (1.00000000) (ATOM)', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          asset: atomRegistration.asset,
          reference: atomRegistration.reference,
          amount: '1.00000000' // Wrong amount
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toContain('validation failed');
    });
  });

  describe('4. Cross-Asset Validation', () => {
    test('should verify different decimal handling between BTC and ATOM', () => {
      // This test verifies our test setup worked correctly
      expect(registrationData.btc).toBeDefined();
      expect(registrationData.atom).toBeDefined();
      
      // Different assets should have different characteristics
      expect(registrationData.btc.asset).not.toBe(registrationData.atom.asset);
      expect(registrationData.btc.reference).not.toBe(registrationData.atom.reference);
      
      // Minimum amounts should reflect different decimal handling
      expect(registrationData.btc.minimum_amount_to_send).toBeDefined();
      expect(registrationData.atom.minimum_amount_to_send).toBeDefined();
    });

    test('should fail when mixing BTC reference with ATOM asset', async () => {
      const response = await request(server)
        .post('/api/v1/preflight')
        .send({
          asset: TEST_ASSETS.ATOM,
          reference: registrationData.btc.reference,
          amount: registrationData.btc.minimum_amount_to_send
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('5. Registration Status Checks', () => {
    test('should get BTC registration status', async () => {
      const response = await request(server)
        .get(`/api/v1/register/${registrationData.btc.internal_api_id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.registration).toBeDefined();
      expect(response.body.registration.status).toBe('confirmed');
      expect(response.body.registration.referenceId).toBe(registrationData.btc.reference);
    });

    test('should get ATOM registration status', async () => {
      const response = await request(server)
        .get(`/api/v1/register/${registrationData.atom.internal_api_id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.registration).toBeDefined();
      expect(response.body.registration.status).toBe('confirmed');
      expect(response.body.registration.referenceId).toBe(registrationData.atom.reference);
    });

    test('should fail to get non-existent registration', async () => {
      const response = await request(server)
        .get('/api/v1/register/nonexistent123')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('REGISTRATION_NOT_FOUND');
    });
  });

  describe('6. Assets Endpoint', () => {
    test('should get valid assets list', async () => {
      const response = await request(server)
        .get('/api/v1/assets')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.assets).toBeDefined();
      expect(Array.isArray(response.body.assets)).toBe(true);
      expect(response.body.assets.length).toBeGreaterThan(0);
      
      // Should contain our test assets
      const assetNames = response.body.assets.map((a: any) => a.asset);
      expect(assetNames).toContain(TEST_ASSETS.BTC);
      expect(assetNames).toContain(TEST_ASSETS.ATOM);
    });
  });

  describe('7. Health Check', () => {
    test('should return healthy status', async () => {
      const response = await request(server)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.wallet).toBeDefined();
      expect(response.body.thorchain).toBeDefined();
    });
  });
});
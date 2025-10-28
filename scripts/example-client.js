#!/usr/bin/env node
/**
 * Example client demonstrating the THORChain Memoless API usage
 * 
 * This script shows how to:
 * 1. Get available assets
 * 2. Register a memo
 * 3. Check registration status
 * 4. Perform preflight checks
 * 5. Track transactions
 */

const axios = require('axios');

class MemolessApiClient {
  constructor(baseUrl = 'http://localhost:8080') {
    this.baseUrl = baseUrl;
  }

  async checkHealth() {
    try {
      console.log('🏥 Checking API health...');
      const response = await axios.get(`${this.baseUrl}/health`);
      console.log('✅ API Health:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
  }

  async getAssets() {
    try {
      console.log('🪙 Fetching available assets...');
      const response = await axios.get(`${this.baseUrl}/api/v1/assets`);
      console.log(`✅ Found ${response.data.assets.length} assets available for memoless registration`);
      
      // Display top 5 assets
      const topAssets = response.data.assets.slice(0, 5);
      topAssets.forEach((asset, index) => {
        console.log(`${index + 1}. ${asset.asset} - $${asset.priceUSD.toFixed(2)} USD (${asset.decimals} decimals)`);
      });
      
      return response.data.assets;
    } catch (error) {
      console.error('❌ Failed to fetch assets:', error.message);
      throw error;
    }
  }

  async getAssetDetails(assetName) {
    try {
      console.log(`🔍 Getting details for asset: ${assetName}`);
      const response = await axios.get(`${this.baseUrl}/api/v1/assets/${assetName}`);
      console.log('✅ Asset details:', response.data.asset);
      return response.data.asset;
    } catch (error) {
      console.error('❌ Failed to fetch asset details:', error.message);
      throw error;
    }
  }

  async registerMemo(asset, memo) {
    try {
      console.log('📝 Registering memo...');
      console.log(`   Asset: ${asset}`);
      console.log(`   Memo: ${memo}`);
      
      const response = await axios.post(`${this.baseUrl}/api/v1/register`, {
        asset,
        memo
      });
      
      console.log('✅ Registration completed:', response.data);
      console.log(`   Registration ID: ${response.data.internal_api_id}`);
      console.log(`   Reference ID: ${response.data.reference} (${response.data.reference_length} digits)`);
      console.log(`   Transaction Hash: ${response.data.txHash}`);
      console.log(`   Minimum Amount: ${response.data.minimum_amount_to_send} ${asset}`);
      
      return response.data;
    } catch (error) {
      if (error.response?.data?.error) {
        const err = error.response.data.error;
        console.error(`❌ Registration failed: ${err.message}`);
      } else {
        console.error('❌ Registration failed:', error.message);
      }
      throw error;
    }
  }

  async getRegistrationStatus(registrationId) {
    try {
      console.log(`🔍 Checking registration status: ${registrationId}`);
      const response = await axios.get(`${this.baseUrl}/api/v1/register/${registrationId}`);
      console.log('✅ Registration status:', response.data.registration);
      return response.data.registration;
    } catch (error) {
      console.error('❌ Failed to get registration status:', error.response?.data || error.message);
      throw error;
    }
  }

  async preflightCheck(options) {
    try {
      console.log(`🛫 Performing preflight check...`);
      console.log(`   Options:`, options);
      
      const response = await axios.post(`${this.baseUrl}/api/v1/preflight`, options);
      
      const result = response.data;
      console.log('✅ Preflight result:', {
        isValid: result.isValid,
        asset: result.asset,
        reference: result.reference,
        processedAmount: result.processedAmount,
        usage: `${result.usage.current_uses}/${result.usage.max_uses}`,
        available: result.usage.available
      });

      if (result.deposit) {
        console.log('📋 Deposit Information:');
        console.log(`   Address: ${result.deposit.inbound_address}`);
        console.log(`   Chain: ${result.deposit.chain}`);
        console.log(`   Dust Threshold: ${result.deposit.dust_threshold}`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Preflight check failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async trackTransaction(amount, asset, reference) {
    try {
      console.log(`🔍 Tracking transaction...`);
      console.log(`   Amount: ${amount}`);
      console.log(`   Asset: ${asset}`);
      console.log(`   Reference: ${reference}`);
      
      const response = await axios.post(`${this.baseUrl}/api/v1/track-transaction`, {
        amount,
        asset,
        reference
      });
      
      console.log('✅ Transaction tracking result:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Transaction tracking failed:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Example usage
async function example() {
  const client = new MemolessApiClient();
  
  try {
    // 1. Check API health
    await client.checkHealth();
    
    // 2. Get available assets
    const assets = await client.getAssets();
    if (assets.length === 0) {
      console.log('❌ No assets available for registration');
      return;
    }
    
    // 3. Get details for the first asset
    const asset = assets[0].asset;
    await client.getAssetDetails(asset);
    
    // 4. Register a memo
    const memo = '=:BTC.BTC:bc1quser123456789abcdef123456789abcdef123456:1000';
    
    console.log(`\n🚀 Starting registration example...`);
    console.log(`📋 Selected asset: ${asset} ($${assets[0].priceUSD?.toFixed(2)})`);
    console.log(`📝 Memo to register: ${memo}`);
    
    const registration = await client.registerMemo(asset, memo);
    
    // 5. Check registration status
    const status = await client.getRegistrationStatus(registration.internal_api_id);
    
    // 6. Perform preflight check with the registered reference
    if (status.referenceId) {
      const preflightResult = await client.preflightCheck({
        asset: asset,
        reference: registration.reference,
        amount: registration.minimum_amount_to_send
      });
      
      if (preflightResult.isValid) {
        console.log('\n🎉 Preflight passed! Ready to send transaction.');
        
        // 7. Demo transaction tracking (would normally be done after actual blockchain transaction)
        await client.trackTransaction(
          registration.minimum_amount_to_send,
          asset,
          registration.reference
        );
      }
    }
    
    console.log('\n✅ Example completed successfully!');
    
  } catch (error) {
    console.error('❌ Example failed:', error.message);
    process.exit(1);
  }
}

// Run example if this file is executed directly
if (require.main === module) {
  console.log('🚀 Starting THORChain Memoless API Example Client\n');
  example();
}

module.exports = MemolessApiClient;
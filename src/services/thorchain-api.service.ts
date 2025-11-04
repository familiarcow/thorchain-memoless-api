import axios, { AxiosInstance } from 'axios';
import { Pool, InboundAddress, MemoReference, MemoCheckResponse, BlockInfo, NetworkConfig } from '../types';

export class ThorchainApiService {
  private api: AxiosInstance;
  private config: NetworkConfig;
  private clientId: string;

  constructor(config: NetworkConfig, walletAddress?: string) {
    console.log(`🚀 [ThorchainApiService] Initializing THORChain API service...`);
    console.log(`🌐 [ThorchainApiService] Network: ${config.network}`);
    console.log(`🔗 [ThorchainApiService] API URL: ${config.apiUrl}`);
    
    this.config = config;
    this.clientId = this.generateClientId(walletAddress);
    
    this.api = axios.create({
      baseURL: config.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': this.clientId,
      },
    });

    console.log(`🔑 [ThorchainApiService] Client ID generated: ${this.clientId}`);
    console.log(`⏰ [ThorchainApiService] Request timeout: 10000ms`);
    console.log(`✅ [ThorchainApiService] Initialization complete`);
  }

  private generateClientId(walletAddress?: string): string {
    // Get base name from environment or use default
    const baseName = process.env.API_CLIENT_NAME || 'memoless-api';
    
    if (walletAddress && walletAddress.length >= 4) {
      // Extract last 4 characters of the wallet address
      const suffix = walletAddress.slice(-4).toLowerCase();
      return `${baseName}-${suffix}`;
    } else {
      // Fallback: use random 4 character suffix
      const randomSuffix = Math.random().toString(36).substr(2, 4);
      return `${baseName}-${randomSuffix}`;
    }
  }

  updateNetwork(config: NetworkConfig): void {
    this.config = config;
    this.api.defaults.baseURL = config.apiUrl;
    // Keep the same client ID when switching networks
    this.api.defaults.headers['x-client-id'] = this.clientId;
  }

  getClientId(): string {
    return this.clientId;
  }

  updateClientId(walletAddress: string): void {
    console.log(`🔄 [ThorchainApiService] Updating client ID with wallet address...`);
    console.log(`📍 [ThorchainApiService] Wallet address: ${walletAddress}`);
    
    const newClientId = this.generateClientId(walletAddress);
    const oldClientId = this.clientId;
    
    this.clientId = newClientId;
    this.api.defaults.headers['x-client-id'] = this.clientId;
    
    console.log(`🔄 [ThorchainApiService] Client ID updated: ${oldClientId} -> ${this.clientId}`);
  }

  async getPools(): Promise<Pool[]> {
    console.log(`🏊 [ThorchainApiService] Fetching THORChain pools...`);
    console.log(`🔗 [ThorchainApiService] Endpoint: /thorchain/pools`);
    
    try {
      const response = await this.api.get('/thorchain/pools');
      console.log(`📡 [ThorchainApiService] Pools API response status: ${response.status}`);
      
      const pools: Pool[] = response.data || [];
      console.log(`📊 [ThorchainApiService] Received ${pools.length} total pools`);
      
      // Clean and normalize the pool data
      const availablePools = pools.filter(pool => pool.status === 'Available');
      console.log(`✅ [ThorchainApiService] Filtered to ${availablePools.length} available pools`);
      
      const normalizedPools = availablePools.map(pool => this.normalizePoolData(pool));
      console.log(`🔧 [ThorchainApiService] Normalized pool data complete`);
      
      return normalizedPools;
    } catch (error) {
      console.error(`❌ [ThorchainApiService] Error fetching pools:`, error);
      if ((error as any).response) {
        console.error(`❌ [ThorchainApiService] HTTP status: ${(error as any).response.status}`);
      }
      throw new Error('Failed to fetch THORChain pools');
    }
  }

  private normalizePoolData(rawPool: any): Pool {
    const normalizeFromE8 = (value: string | number | undefined): number => {
      if (value === undefined || value === null) return 0;
      return typeof value === 'string' ? parseFloat(value) / 1e8 : value / 1e8;
    };

    const parseNumber = (value: string | number | undefined): number => {
      if (value === undefined || value === null) return 0;
      return typeof value === 'string' ? parseFloat(value) : value;
    };

    return {
      asset: rawPool.asset,
      status: rawPool.status,
      decimal: parseNumber(rawPool.decimal) || parseNumber(rawPool.decimals),
      decimals: parseNumber(rawPool.decimals) || parseNumber(rawPool.decimal) || 8,
      balance_asset: normalizeFromE8(rawPool.balance_asset),
      balance_rune: normalizeFromE8(rawPool.balance_rune),
      asset_price_usd: rawPool.asset_tor_price ? normalizeFromE8(rawPool.asset_tor_price) : 0,
      pending_inbound_asset: normalizeFromE8(rawPool.pending_inbound_asset),
      pending_inbound_rune: normalizeFromE8(rawPool.pending_inbound_rune),
      pool_units: normalizeFromE8(rawPool.pool_units),
      LP_units: normalizeFromE8(rawPool.LP_units),
      synth_units: normalizeFromE8(rawPool.synth_units),
      synth_supply: normalizeFromE8(rawPool.synth_supply),
      savers_depth: normalizeFromE8(rawPool.savers_depth),
      savers_units: normalizeFromE8(rawPool.savers_units),
      synth_mint_paused: rawPool.synth_mint_paused,
      synth_supply_remaining: normalizeFromE8(rawPool.synth_supply_remaining),
      loan_collateral: normalizeFromE8(rawPool.loan_collateral),
      loan_collateral_remaining: normalizeFromE8(rawPool.loan_collateral_remaining),
      loan_cr: parseNumber(rawPool.loan_cr),
      derived_depth_bps: parseNumber(rawPool.derived_depth_bps),
      trading_halted: rawPool.trading_halted || false
    };
  }

  async getInboundAddresses(): Promise<InboundAddress[]> {
    console.log(`📥 [ThorchainApiService] Fetching inbound addresses...`);
    
    try {
      const response = await this.api.get('/thorchain/inbound_addresses');
      console.log(`📡 [ThorchainApiService] Inbound addresses response status: ${response.status}`);
      
      const addresses = response.data || [];
      console.log(`📊 [ThorchainApiService] Received ${addresses.length} inbound addresses`);
      
      addresses.forEach((addr: any, index: number) => {
        console.log(`   ${index + 1}. ${addr.chain}: ${addr.address} (halted: ${addr.halted})`);
      });
      
      return addresses;
    } catch (error) {
      console.error(`❌ [ThorchainApiService] Error fetching inbound addresses:`, error);
      throw new Error('Failed to fetch THORChain inbound addresses');
    }
  }

  async getMemoReference(txId: string): Promise<MemoReference> {
    console.log(`📝 [ThorchainApiService] Fetching memo reference for transaction: ${txId}`);
    
    try {
      const response = await this.api.get(`/thorchain/memo/${txId}`);
      console.log(`📡 [ThorchainApiService] Memo reference response status: ${response.status}`);
      console.log(`📋 [ThorchainApiService] Memo reference data: ${JSON.stringify(response.data)}`);
      
      return response.data;
    } catch (error) {
      console.error(`❌ [ThorchainApiService] Error fetching memo reference for ${txId}:`, error);
      throw new Error(`Failed to fetch memo reference for transaction ${txId}`);
    }
  }

  async checkMemoValidation(asset: string, rawAmount: string): Promise<MemoCheckResponse> {
    try {
      const response = await this.api.get(`/thorchain/memo/check/${asset}/${rawAmount}`);
      return response.data;
    } catch (error) {
      console.error('Error checking memo validation:', error);
      throw new Error(`Failed to check memo validation for ${asset}/${rawAmount}`);
    }
  }

  async getCurrentBlock(): Promise<BlockInfo[]> {
    try {
      const response = await this.api.get('/thorchain/lastblock/THORCHAIN');
      return response.data;
    } catch (error) {
      console.error('Error fetching current block:', error);
      throw new Error('Failed to fetch current THORChain block');
    }
  }

  async getMemolessTxCost(): Promise<number> {
    console.log(`💰 [ThorchainApiService] Fetching memoless transaction cost from mimir...`);
    
    try {
      const response = await this.api.get('/thorchain/mimir/key/MEMOLESSTXNCOST');
      console.log(`📡 [ThorchainApiService] Memoless TX cost response status: ${response.status}`);
      
      const costInRune1e8 = parseInt(response.data);
      if (isNaN(costInRune1e8)) {
        throw new Error('Invalid memoless transaction cost value received from mimir');
      }
      
      const costInRune = costInRune1e8 / 1e8;
      
      console.log(`💰 [ThorchainApiService] Memoless TX cost: ${costInRune1e8} raw (${costInRune} RUNE)`);
      return costInRune;
    } catch (error) {
      console.error(`❌ [ThorchainApiService] Failed to fetch memoless TX cost:`, error);
      throw new Error(`Failed to fetch memoless transaction cost: ${(error as Error).message}`);
    }
  }

  calculateRegistrationsRemaining(runeBalance: string, memolessTxCost: number, networkTxFee: number = 0.02): number {
    try {
      const balance = parseFloat(runeBalance);
      const totalCostPerRegistration = memolessTxCost + networkTxFee;
      const remaining = Math.floor(balance / totalCostPerRegistration);
      
      console.log(`🧮 [ThorchainApiService] Registrations calculation:`);
      console.log(`   💰 Balance: ${balance} RUNE`);
      console.log(`   🏷️  Memoless cost: ${memolessTxCost} RUNE`);
      console.log(`   ⛽ Network fee: ${networkTxFee} RUNE`);
      console.log(`   📊 Total per registration: ${totalCostPerRegistration} RUNE`);
      console.log(`   🔢 Registrations remaining: ${remaining}`);
      
      return Math.max(0, remaining);
    } catch (error) {
      console.error('Error calculating registrations remaining:', error);
      return 0;
    }
  }

  async getNodeInfo(): Promise<any> {
    try {
      let response;
      try {
        response = await this.api.get('/thorchain/network');
      } catch (networkError) {
        try {
          response = await this.api.get('/thorchain/constants');
        } catch (constantsError) {
          response = await this.api.get('/thorchain/pools');
          return { 
            status: 'active', 
            network: this.config.network,
            endpoints_working: true,
            pools_available: Array.isArray(response.data) ? response.data.length : 0
          };
        }
      }
      return response.data;
    } catch (error) {
      console.error('Error fetching node info:', error);
      return {
        status: 'unknown',
        network: this.config.network,
        error: 'Node info unavailable',
        endpoints_working: false
      };
    }
  }
}
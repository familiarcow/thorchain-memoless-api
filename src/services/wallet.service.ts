import * as bip39 from 'bip39';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { stringToPath } from '@cosmjs/crypto';
import { WalletInfo, NetworkConfig, Balance } from '../types';

export class WalletService {
  private static readonly THORCHAIN_HD_PATH = "m/44'/931'/0'/0/0";
  private config: NetworkConfig;
  private cachedWalletInfo: WalletInfo | null = null;
  private isInitialized: boolean = false;
  private thorchainApi: any; // Will be injected after construction

  constructor(config: NetworkConfig) {
    this.config = config;
  }

  updateNetwork(config: NetworkConfig): void {
    console.log(`🔄 [WalletService] Updating network from ${this.config.network} to ${config.network}`);
    console.log(`🔄 [WalletService] New RPC URL: ${config.rpcUrl}`);
    console.log(`🔄 [WalletService] New API URL: ${config.apiUrl}`);
    
    this.config = config;
    // Force re-initialization with new network
    this.isInitialized = false;
    this.cachedWalletInfo = null;
    
    console.log(`✅ [WalletService] Network update complete, wallet will reinitialize on next use`);
  }

  static generateSeedPhrase(): string {
    return bip39.generateMnemonic();
  }

  static validateSeedPhrase(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
  }

  async initialize(encryptedMnemonic: string): Promise<void> {
    console.log(`🚀 [WalletService] Starting wallet initialization for network: ${this.config.network}`);
    
    if (this.isInitialized) {
      console.log(`⚠️  [WalletService] Wallet already initialized, skipping`);
      return;
    }

    if (!encryptedMnemonic) {
      console.error(`❌ [WalletService] No encrypted mnemonic provided`);
      throw new Error('Encrypted mnemonic is required for wallet initialization');
    }

    console.log(`🔓 [WalletService] Decrypting mnemonic...`);
    // Decrypt the mnemonic (implement proper decryption in production)
    const mnemonic = this.decryptMnemonic(encryptedMnemonic);
    console.log(`✅ [WalletService] Mnemonic decrypted successfully`);

    console.log(`🔍 [WalletService] Validating seed phrase...`);
    if (!WalletService.validateSeedPhrase(mnemonic)) {
      console.error(`❌ [WalletService] Invalid seed phrase provided`);
      throw new Error('Invalid seed phrase provided');
    }
    console.log(`✅ [WalletService] Seed phrase validation passed`);

    console.log(`🏗️  [WalletService] Creating wallet info for both networks...`);
    // Create wallet info for both networks
    this.cachedWalletInfo = await this.createWalletFromSeed(mnemonic);
    this.isInitialized = true;

    console.log(`🔥 [WalletService] Wallet initialized successfully for ${this.config.network}`);
    console.log(`📍 [WalletService] Address: ${this.cachedWalletInfo.address}`);
    console.log(`📍 [WalletService] Mainnet Address: ${this.cachedWalletInfo.mainnetAddress}`);
    console.log(`📍 [WalletService] Stagenet Address: ${this.cachedWalletInfo.stagenetAddress}`);
  }

  private decryptMnemonic(encryptedMnemonic: string): string {
    console.log(`🔐 [WalletService] Attempting to decrypt mnemonic (length: ${encryptedMnemonic.length})`);
    
    // TODO: Implement proper encryption/decryption
    // For development, support both base64 and plaintext
    try {
      // Try base64 decode first
      console.log(`🔍 [WalletService] Trying base64 decoding...`);
      const decoded = Buffer.from(encryptedMnemonic, 'base64').toString('utf-8');
      
      // Validate that the decoded result looks like a mnemonic (words separated by spaces)
      if (decoded.split(' ').length >= 12 && decoded.match(/^[a-z ]+$/)) {
        console.log(`✅ [WalletService] Successfully decoded from base64`);
        return decoded;
      } else {
        throw new Error('Base64 decode did not produce valid mnemonic format');
      }
    } catch (error) {
      // Fall back to plaintext (for development)
      console.log(`⚠️  [WalletService] Base64 decode failed, using plaintext (development mode)`);
      return encryptedMnemonic;
    }
  }

  private async createWalletFromSeed(mnemonic: string): Promise<WalletInfo> {
    console.log(`🏗️  [WalletService] Creating wallet from seed phrase...`);
    console.log(`🔗 [WalletService] Using HD path: ${WalletService.THORCHAIN_HD_PATH}`);
    
    // Derive addresses for both networks
    console.log(`🌐 [WalletService] Deriving mainnet address (thor prefix)...`);
    const mainnetAddress = await this.deriveAddressForNetwork(mnemonic, 'thor');
    console.log(`✅ [WalletService] Mainnet address: ${mainnetAddress}`);
    
    console.log(`🌐 [WalletService] Deriving stagenet address (sthor prefix)...`);
    const stagenetAddress = await this.deriveAddressForNetwork(mnemonic, 'sthor');
    console.log(`✅ [WalletService] Stagenet address: ${stagenetAddress}`);

    console.log(`🔑 [WalletService] Creating wallet for current network (${this.config.addressPrefix})...`);
    // Create wallet with current network's prefix to get pubkey
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: this.config.addressPrefix,
      hdPaths: [stringToPath(WalletService.THORCHAIN_HD_PATH)]
    });

    const accounts = await wallet.getAccounts();
    const account = accounts[0];
    
    console.log(`🔑 [WalletService] Generated public key: ${Buffer.from(account.pubkey).toString('hex').substring(0, 8)}...`);

    const walletInfo = {
      address: account.address, // Current network address
      mainnetAddress,
      stagenetAddress,
      publicKey: Buffer.from(account.pubkey).toString('hex'),
      mnemonic: mnemonic
    };
    
    console.log(`✅ [WalletService] Wallet creation complete`);
    return walletInfo;
  }

  private async deriveAddressForNetwork(mnemonic: string, prefix: string): Promise<string> {
    const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix: prefix,
      hdPaths: [stringToPath(WalletService.THORCHAIN_HD_PATH)]
    });

    const accounts = await wallet.getAccounts();
    return accounts[0].address;
  }

  async deriveAddress(mnemonic: string): Promise<string> {
    const walletInfo = await this.createWalletFromSeed(mnemonic);
    return walletInfo.address;
  }

  getWalletInfo(): WalletInfo {
    if (!this.isInitialized || !this.cachedWalletInfo) {
      throw new Error('Wallet not initialized. Call initialize() first.');
    }
    return this.cachedWalletInfo;
  }

  getAddress(): string {
    return this.getWalletInfo().address;
  }

  getCurrentNetwork(): string {
    return this.config.network;
  }

  isWalletReady(): boolean {
    return this.isInitialized && this.cachedWalletInfo !== null;
  }

  // Create a fresh CosmJS wallet instance for transactions
  async createCosmJSWallet(): Promise<DirectSecp256k1HdWallet> {
    if (!this.cachedWalletInfo) {
      throw new Error('Wallet not initialized');
    }

    return await DirectSecp256k1HdWallet.fromMnemonic(this.cachedWalletInfo.mnemonic, {
      prefix: this.config.addressPrefix,
      hdPaths: [stringToPath(WalletService.THORCHAIN_HD_PATH)]
    });
  }

  // Dependency injection for ThorchainApiService
  setThorchainApi(thorchainApi: any): void {
    this.thorchainApi = thorchainApi;
  }

  // Get RUNE balance for the hot wallet
  async getBalance(): Promise<string> {
    console.log(`💰 [WalletService] Starting balance fetch...`);
    
    if (!this.thorchainApi) {
      console.error(`❌ [WalletService] ThorchainApiService not injected`);
      throw new Error('ThorchainApiService not injected. Call setThorchainApi() first.');
    }
    
    if (!this.isWalletReady()) {
      console.error(`❌ [WalletService] Wallet not initialized for balance check`);
      throw new Error('Wallet not initialized');
    }

    try {
      const address = this.getAddress();
      console.log(`📍 [WalletService] Fetching balance for address: ${address}`);
      
      console.log(`🌐 [WalletService] Calling cosmos bank API for balances...`);
      const balances = await this.getWalletBalances(address);
      console.log(`📊 [WalletService] Received ${balances.length} balance entries`);
      
      if (balances.length > 0) {
        console.log(`📋 [WalletService] Available assets: ${balances.map(b => b.asset).join(', ')}`);
      }
      
      const runeBalance = balances.find(balance => balance.asset === 'rune');
      
      if (!runeBalance) {
        console.log(`⚠️  [WalletService] No RUNE balance found, returning 0`);
        return '0';
      }

      console.log(`💎 [WalletService] Raw RUNE amount (base units): ${runeBalance.amount}`);
      
      // Convert from base units (1e8) to RUNE
      const runeAmount = parseFloat(runeBalance.amount) / 1e8;
      console.log(`💰 [WalletService] RUNE balance: ${runeAmount} RUNE`);
      
      return runeAmount.toString();
    } catch (error) {
      console.error(`❌ [WalletService] Error fetching RUNE balance:`, error);
      return '0';
    }
  }

  // Validate if wallet has sufficient RUNE funds for memo registration
  async validateSufficientFunds(minimumRune: number = 0.02): Promise<boolean> {
    console.log(`🏦 [WalletService] Validating sufficient funds (minimum: ${minimumRune} RUNE)...`);
    
    try {
      console.log(`💰 [WalletService] Fetching current balance for validation...`);
      const balance = await this.getBalance();
      const runeBalance = parseFloat(balance);
      
      console.log(`📊 [WalletService] Current balance: ${runeBalance} RUNE`);
      console.log(`🎯 [WalletService] Required minimum: ${minimumRune} RUNE`);
      
      const hasSufficientFunds = runeBalance >= minimumRune;
      const shortfall = minimumRune - runeBalance;
      
      if (hasSufficientFunds) {
        console.log(`✅ [WalletService] Sufficient funds available (surplus: ${(runeBalance - minimumRune).toFixed(4)} RUNE)`);
      } else {
        console.log(`❌ [WalletService] Insufficient funds (shortfall: ${shortfall.toFixed(4)} RUNE)`);
      }
      
      return hasSufficientFunds;
    } catch (error) {
      console.error(`❌ [WalletService] Error validating sufficient funds:`, error);
      console.log(`🚨 [WalletService] Returning false due to validation error`);
      return false;
    }
  }

  // Private method to get wallet balances using cosmos bank API
  private async getWalletBalances(address: string): Promise<Balance[]> {
    console.log(`🌐 [WalletService] Fetching balances from cosmos bank API...`);
    console.log(`🔗 [WalletService] Endpoint: /cosmos/bank/v1beta1/balances/${address}`);
    
    try {
      // Use the same pattern as legacy service
      const response = await this.thorchainApi.api.get(`/cosmos/bank/v1beta1/balances/${address}`);
      
      console.log(`📡 [WalletService] API response status: ${response.status}`);
      
      if (!response.data || !response.data.balances) {
        console.log(`⚠️  [WalletService] Empty response or no balances field, returning empty array`);
        return [];
      }

      console.log(`📊 [WalletService] Raw balances data: ${JSON.stringify(response.data.balances, null, 2)}`);

      const balances = response.data.balances.map((balance: any) => ({
        asset: balance.denom,
        amount: balance.amount
      }));
      
      console.log(`✅ [WalletService] Parsed ${balances.length} balance entries`);
      balances.forEach((balance: Balance, index: number) => {
        console.log(`   ${index + 1}. ${balance.asset}: ${balance.amount} base units`);
      });

      return balances;
    } catch (error) {
      console.error(`❌ [WalletService] Error fetching wallet balances:`, error);
      if ((error as any).response) {
        console.error(`❌ [WalletService] HTTP status: ${(error as any).response.status}`);
        console.error(`❌ [WalletService] HTTP response: ${JSON.stringify((error as any).response.data)}`);
      }
      throw new Error(`Failed to fetch balances for address ${address}`);
    }
  }
}
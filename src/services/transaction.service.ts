import { Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate';
import { WalletService } from './wallet.service';
import { TransactionParams, TransactionResponse, NetworkConfig } from '../types';
import { createMsgDeposit, registerMsgDeposit } from '../utils/msgDeposit';

export class TransactionService {
  private walletService: WalletService;
  private config: NetworkConfig;

  constructor(walletService: WalletService, config: NetworkConfig) {
    this.walletService = walletService;
    this.config = config;
  }

  updateNetwork(config: NetworkConfig): void {
    this.config = config;
  }

  static getAssetDenom(asset: string): string {
    // Convert asset format to denom
    if (asset === 'THOR.RUNE') {
      return 'rune';
    }
    
    // For other assets, convert format like 'BTC.BTC' to 'btc/btc'
    const [chain, assetName] = asset.split('.');
    if (!chain || !assetName) {
      throw new Error(`Invalid asset format: ${asset}`);
    }
    
    return `${chain.toLowerCase()}/${assetName.toLowerCase()}`;
  }

  static convertToBaseUnits(amount: string, asset: string): string {
    // Get decimals for the asset
    const decimals = TransactionService.getAssetDecimals(asset);
    
    // Convert using string manipulation to avoid floating point issues
    const [integerPart = '0', decimalPart = ''] = amount.split('.');
    const paddedDecimalPart = decimalPart.padEnd(decimals, '0').substring(0, decimals);
    const rawAmountStr = integerPart + paddedDecimalPart;
    
    // Don't strip leading zeros if result would be empty - keep at least '0'
    const trimmed = rawAmountStr.replace(/^0+/, '');
    return trimmed || '0';
  }


  static getAssetDecimals(asset: string): number {
    // Default decimals based on asset
    if (asset === 'THOR.RUNE') return 8;
    
    const [chain] = asset.split('.');
    const decimalMap: { [key: string]: number } = {
      'BTC': 8,
      'ETH': 18,
      'LTC': 8,
      'BCH': 8,
      'BNB': 8,
      'AVAX': 18,
      'ATOM': 6,
      'DOGE': 8,
      'BSC': 18,
      'GAIA': 6,
      'BASE': 18,
      'XRP': 6
    };
    
    return decimalMap[chain] || 8;
  }

  private static validateTransactionParams(params: TransactionParams): void {
    if (!params.asset) {
      throw new Error('Asset is required');
    }
    
    if (params.useMsgDeposit) {
      if (params.amount === undefined || params.amount === null || parseFloat(params.amount) < 0) {
        throw new Error('Amount must be zero or greater for MsgDeposit transactions');
      }
      if (!params.memo) {
        throw new Error('Memo is required for MsgDeposit transactions');
      }
    } else {
      if (!params.amount || parseFloat(params.amount) <= 0) {
        throw new Error('Amount must be greater than zero for send transactions');
      }
      if (!params.toAddress) {
        throw new Error('To address is required for send transactions');
      }
    }
  }

  async broadcastTransaction(params: TransactionParams): Promise<TransactionResponse> {
    console.log(`🚀 [TransactionService] Starting transaction broadcast...`);
    console.log(`💰 [TransactionService] Asset: ${params.asset}, Amount: ${params.amount}`);
    console.log(`📝 [TransactionService] Memo: ${params.memo || 'none'}`);
    console.log(`🎯 [TransactionService] To Address: ${params.toAddress || 'not specified'}`);
    console.log(`🏦 [TransactionService] Use MsgDeposit: ${params.useMsgDeposit || false}`);
    
    // Validate parameters
    console.log(`🔍 [TransactionService] Validating transaction parameters...`);
    TransactionService.validateTransactionParams(params);
    console.log(`✅ [TransactionService] Parameter validation passed`);

    // Get wallet and create CosmJS client
    console.log(`🔑 [TransactionService] Creating CosmJS wallet...`);
    const cosmjsWallet = await this.walletService.createCosmJSWallet();
    const accounts = await cosmjsWallet.getAccounts();
    const signerAddress = accounts[0].address;
    console.log(`📍 [TransactionService] Signer address: ${signerAddress}`);

    console.log(`🌐 [TransactionService] Connecting to RPC endpoint: ${this.config.rpcUrl}`);
    const registry = new Registry();
    
    // Register THORChain MsgDeposit message type
    registerMsgDeposit(registry);
    console.log(`✅ [TransactionService] Registered MsgDeposit message type`);
    
    const client = await SigningStargateClient.connectWithSigner(
      this.config.rpcUrl,
      cosmjsWallet,
      { registry }
    );
    console.log(`✅ [TransactionService] Connected to Stargate client`);

    // Prepare transaction
    console.log(`🔧 [TransactionService] Preparing transaction coin...`);
    const denom = TransactionService.getAssetDenom(params.asset);
    const baseAmount = TransactionService.convertToBaseUnits(params.amount, params.asset);
    const coin = {
      denom: denom,
      amount: baseAmount
    };
    console.log(`💎 [TransactionService] Coin: ${coin.amount} ${coin.denom}`);

    let message: any;
    if (params.useMsgDeposit) {
      // Use real THORChain MsgDeposit message type
      message = createMsgDeposit({
        coins: [coin],
        memo: params.memo || '',
        signer: signerAddress
      });
      console.log(`🏛️ [TransactionService] Created native MsgDeposit message`);
    } else {
      // Regular MsgSend
      message = {
        typeUrl: "/cosmos.bank.v1beta1.MsgSend",
        value: {
          fromAddress: signerAddress,
          toAddress: params.toAddress!,
          amount: [coin]
        }
      };
    }

    // Get native transaction fee from THORChain network
    console.log('💰 [TransactionService] Fetching native transaction fee...');
    let feeAmount = "2000000"; // Default 0.02 RUNE
    
    try {
      const networkResponse = await fetch(`${this.config.apiUrl}/thorchain/network`);
      if (networkResponse.ok) {
        const networkInfo = await networkResponse.json() as { native_tx_fee_rune?: string };
        if (networkInfo.native_tx_fee_rune) {
          feeAmount = networkInfo.native_tx_fee_rune;
          console.log(`💰 [TransactionService] Using network fee: ${feeAmount} rune (${parseFloat(feeAmount) / 1e8} RUNE)`);
        }
      }
    } catch (error) {
      console.warn('💰 [TransactionService] Failed to fetch network fee, using default:', error);
    }

    const fee = {
      amount: [{ denom: "rune", amount: feeAmount }],
      gas: "50000000"
    };

    try {
      // Query fresh account info for debugging
      console.log('🎯 Broadcasting transaction with params:', {
        asset: params.asset,
        amount: params.amount,
        memo: params.memo,
        useMsgDeposit: params.useMsgDeposit
      });

      const response = await client.signAndBroadcast(
        signerAddress,
        [message],
        fee,
        params.memo || ""
      );

      if (response.code !== 0) {
        throw new Error(`Transaction failed: ${response.rawLog}`);
      }

      console.log('✅ Transaction broadcast successful:', response.transactionHash);
      return {
        code: response.code,
        transactionHash: response.transactionHash,
        rawLog: response.rawLog || '',
        events: response.events as any[]
      };

    } catch (error) {
      console.error('❌ Broadcasting error:', error);
      
      // Handle specific error cases
      if (error instanceof Error && error.message.includes('tx already exists in cache')) {
        throw new Error('Transaction already submitted. Please check your transaction history for the confirmation.');
      }
      
      if (error instanceof Error && error.message.includes('account sequence mismatch')) {
        console.log('🔄 Sequence mismatch detected - attempting retry...');
        
        // Wait and retry once with fresh client
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const freshWallet = await this.walletService.createCosmJSWallet();
          const freshClient = await SigningStargateClient.connectWithSigner(
            this.config.rpcUrl,
            freshWallet,
            { registry }
          );
          
          const retryResponse = await freshClient.signAndBroadcast(
            signerAddress,
            [message],
            fee,
            params.memo || ""
          );

          if (retryResponse.code !== 0) {
            throw new Error(`Retry transaction failed: ${retryResponse.rawLog}`);
          }

          console.log('✅ RETRY successful:', retryResponse.transactionHash);
          return {
            code: retryResponse.code,
            transactionHash: retryResponse.transactionHash,
            rawLog: retryResponse.rawLog || '',
            events: retryResponse.events as any[]
          };
        } catch (retryError) {
          console.error('❌ Retry also failed:', retryError);
          throw new Error(`Transaction failed after retry: ${(retryError as Error).message}`);
        }
      }
      
      throw error;
    }
  }

  async estimateGas(params: TransactionParams): Promise<string> {
    try {
      console.log('⛽ [TransactionService] Fetching THORChain network info for native tx fee...');
      
      // Fetch THORChain network info to get native transaction fee
      const response = await fetch(`${this.config.apiUrl}/thorchain/network`);
      if (!response.ok) {
        throw new Error(`Network info request failed: ${response.status}`);
      }
      
      const networkInfo = await response.json() as { native_tx_fee_rune?: string };
      const nativeTxFeeRune = networkInfo.native_tx_fee_rune;
      
      if (!nativeTxFeeRune) {
        throw new Error('Could not retrieve native_tx_fee_rune from network info');
      }
      
      console.log(`⛽ [TransactionService] Native tx fee: ${nativeTxFeeRune} rune (${parseFloat(nativeTxFeeRune) / 1e8} RUNE)`);
      
      // THORChain uses a fixed gas limit, typically very high
      // The actual fee is determined by native_tx_fee_rune, not gas calculation
      return "50000000"; // Standard gas limit for THORChain transactions
      
    } catch (error) {
      console.warn('⛽ [TransactionService] Failed to fetch network info, using default:', error);
      return "50000000"; // Default gas limit
    }
  }
}
import * as QRCode from 'qrcode';
import { 
  MemolessAsset, 
  Pool, 
  InboundAddress, 
  MemoReference, 
  MemoCheckResponse, 
  AmountValidationResult, 
  QRCodeData, 
  TransactionParams,
  NetworkConfig 
} from '../types';
import { ThorchainApiService } from './thorchain-api.service';
import { TransactionService } from './transaction.service';
import { WalletService } from './wallet.service';

export interface MemolessValidationResult {
  isValid: boolean;
  memoCheck: MemoCheckResponse;
  errors: string[];
}

export class MemolessService {
  private thorchainApi: ThorchainApiService;
  private transactionService: TransactionService;
  private walletService: WalletService;
  private config: NetworkConfig;

  constructor(
    thorchainApi: ThorchainApiService,
    transactionService: TransactionService,
    walletService: WalletService,
    config: NetworkConfig
  ) {
    this.thorchainApi = thorchainApi;
    this.transactionService = transactionService;
    this.walletService = walletService;
    this.config = config;
  }

  updateNetwork(config: NetworkConfig): void {
    this.config = config;
    this.thorchainApi.updateNetwork(config);
    this.transactionService.updateNetwork(config);
    this.walletService.updateNetwork(config);
  }

  // Get valid assets for registration (Step 2 from memoless.md)
  async getValidAssetsForRegistration(): Promise<MemolessAsset[]> {
    console.log(`🪙 [MemolessService] Fetching valid assets for memoless registration...`);
    
    try {
      console.log(`🏊 [MemolessService] Fetching pools from THORChain API...`);
      const pools = await this.thorchainApi.getPools();
      console.log(`📊 [MemolessService] Received ${pools.length} pools from API`);
      
      // Filter: Status = Available, exclude tokens, exclude ALL THOR chain assets
      console.log(`🔍 [MemolessService] Filtering pools for memoless compatibility...`);
      
      const availablePools = pools.filter(pool => pool.status === 'Available');
      console.log(`✅ [MemolessService] ${availablePools.length} pools with 'Available' status`);
      
      const nonTokenPools = availablePools.filter(pool => !this.isToken(pool.asset));
      console.log(`🪙 [MemolessService] ${nonTokenPools.length} non-token assets (excluding synthetic tokens)`);
      
      const nonThorPools = nonTokenPools.filter(pool => !pool.asset.startsWith('THOR.')); // Remove all THOR chain assets
      console.log(`🚫 [MemolessService] ${nonThorPools.length} assets after excluding THOR chain assets`);
      
      const validAssets = nonThorPools.map(pool => this.convertPoolToMemolessAsset(pool));
      console.log(`🔧 [MemolessService] Converted ${validAssets.length} pools to memoless assets`);

      // Sort by descending balance_rune
      validAssets.sort((a, b) => b.balanceRune - a.balanceRune);
      console.log(`📈 [MemolessService] Sorted assets by RUNE balance (descending)`);
      
      if (validAssets.length > 0) {
        console.log(`🏆 [MemolessService] Top 3 assets by liquidity:`);
        validAssets.slice(0, 3).forEach((asset, index) => {
          console.log(`   ${index + 1}. ${asset.asset}: ${asset.balanceRune.toFixed(2)} RUNE`);
        });
      }

      console.log(`✅ [MemolessService] Returning ${validAssets.length} valid assets for registration`);
      return validAssets;
    } catch (error) {
      console.error(`❌ [MemolessService] Error fetching valid assets:`, error);
      throw new Error(`Failed to fetch valid assets: ${(error as Error).message}`);
    }
  }

  // Check if asset is a token (has contract address)
  private isToken(asset: string): boolean {
    // Asset format: {chain}.{asset}-{contract}
    // If there's a '-{contract}' at the end, it's a token
    const parts = asset.split('.');
    if (parts.length === 2) {
      const assetPart = parts[1];
      return assetPart.includes('-');
    }
    return false;
  }

  // Convert pool data to MemolessAsset
  private convertPoolToMemolessAsset(pool: Pool): MemolessAsset {
    return {
      asset: pool.asset,
      status: pool.status,
      decimals: pool.decimals || pool.decimal || 8,
      priceUSD: pool.asset_price_usd || 0,
      balanceRune: pool.balance_rune,
      isToken: false // Already filtered out tokens
    };
  }

  // Register memo with MsgDeposit (Step 3 from memoless.md)
  async getMemoReference(txHash: string): Promise<MemoReference> {
    return await this.thorchainApi.getMemoReference(txHash);
  }

  async registerMemo(asset: string, memo: string): Promise<string> {
    try {
      const registrationMemo = `REFERENCE:${asset}:${memo}`;
      
      const transactionParams: TransactionParams = {
        asset: 'THOR.RUNE',
        amount: '0', // Zero amount for memoless registration
        useMsgDeposit: true,
        memo: registrationMemo
      };

      const result = await this.transactionService.broadcastTransaction(transactionParams);
      
      if (result.code !== 0) {
        throw new Error(`Registration failed: ${result.rawLog}`);
      }

      return result.transactionHash;
    } catch (error) {
      console.error('Error registering memo:', error);
      throw new Error(`Failed to register memo: ${(error as Error).message}`);
    }
  }

  // Get memo reference with retry logic (Step 4 from memoless.md)
  async getMemoReferenceWithRetry(
    txId: string, 
    maxRetries: number = 5,
    initialDelay: number = 6000
  ): Promise<MemoReference> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries} to retrieve memo reference for ${txId}`);
        
        if (attempt > 1) {
          // Exponential backoff: 6s, 12s, 24s, 48s, 96s
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.log(`Waiting ${delay/1000}s before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Initial delay
          await new Promise(resolve => setTimeout(resolve, initialDelay));
        }
        
        const response = await this.thorchainApi.getMemoReference(txId);
        
        if (response && response.reference) {
          console.log(`Successfully retrieved memo reference on attempt ${attempt}:`, response);
          return response;
        } else {
          throw new Error('Reference ID not found in response');
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`Attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          break;
        }
      }
    }
    
    throw new Error(`Failed to retrieve memo reference after ${maxRetries} attempts: ${lastError?.message}`);
  }

  // Validate memo registration with amount (Step 4.5 from memoless.md)
  async validateMemoRegistration(
    asset: string,
    exactAmount: string,
    decimals: number,
    expectedMemo: string,
    expectedReference: string
  ): Promise<MemolessValidationResult> {
    try {
      // Convert exactAmount from asset units to raw_amount 
      const rawAmount = this.convertToRawAmount(exactAmount, decimals);
      
      const apiUrl = `/thorchain/memo/check/${asset}/${rawAmount}`;
      const memoCheck = await this.thorchainApi.checkMemoValidation(asset, rawAmount);
      const errors: string[] = [];

      // Validate reference matches (as specified in memoless.md)
      if (memoCheck.reference !== expectedReference) {
        const error = `Reference mismatch: expected ${expectedReference}, got ${memoCheck.reference}`;
        console.error(`VALIDATION FAILED: ${error}`);
        console.error(`Validation API call URL: ${apiUrl}`);
        console.error(`API Response:`, JSON.stringify(memoCheck, null, 2));
        errors.push(error);
      }

      // Validate memo matches (as specified in memoless.md)
      if (memoCheck.memo !== expectedMemo) {
        const error = `Memo mismatch: expected ${expectedMemo}, got ${memoCheck.memo}`;
        console.error(`VALIDATION FAILED: ${error}`);
        console.error(`Validation API call URL: ${apiUrl}`);
        console.error(`API Response:`, JSON.stringify(memoCheck, null, 2));
        errors.push(error);
      }

      return {
        isValid: errors.length === 0,
        memoCheck,
        errors
      };
    } catch (error) {
      console.error('ERROR in validateMemoRegistration:', error);
      return {
        isValid: false,
        memoCheck: {} as MemoCheckResponse,
        errors: [`Failed to validate memo registration: ${(error as Error).message}`]
      };
    }
  }

  // Get inbound addresses (Step 5 from memoless.md)
  async getInboundAddresses(): Promise<InboundAddress[]> {
    try {
      return await this.thorchainApi.getInboundAddresses();
    } catch (error) {
      console.error('Error fetching inbound addresses:', error);
      throw new Error(`Failed to fetch inbound addresses: ${(error as Error).message}`);
    }
  }

  // Get inbound address for specific asset (Step 6 from memoless.md)
  getInboundAddressForAsset(
    inboundAddresses: InboundAddress[], 
    asset: string
  ): { address: string; dustThreshold: number } {
    const chain = asset.split('.')[0]; // Extract chain from asset
    
    const inboundAddress = inboundAddresses.find(addr => addr.chain === chain);
    
    if (!inboundAddress) {
      throw new Error(`No inbound address found for chain: ${chain}`);
    }

    return {
      address: inboundAddress.address,
      dustThreshold: parseFloat(inboundAddress.dust_threshold) / 1e8 // Normalize from raw to asset units
    };
  }

  // Validate amount with reference encoding (Step 7 from memoless.md)
  validateAmountToReference(
    amount: string, 
    referenceID: string, 
    assetDecimals: number
  ): boolean {
    try {
      let amountStr = amount.toString();
      
      // If amount has more decimals than assetDecimals, remove extra digits (DO NOT ROUND)
      const [integerPart, decimalPart = ''] = amountStr.split('.');
      let processedDecimalPart = decimalPart;
      
      if (decimalPart.length > assetDecimals) {
        processedDecimalPart = decimalPart.substring(0, assetDecimals);
        console.log(`Amount truncated from ${amountStr} to ${integerPart}.${processedDecimalPart}`);
      }
      
      // Pad with zeros to match assetDecimals
      const paddedDecimals = processedDecimalPart.padEnd(assetDecimals, '0');
      
      // Get last referenceID.length digits
      const referenceLength = referenceID.length;
      const lastDigits = paddedDecimals.slice(-referenceLength);
      
      // Verify that it equals the referenceID exactly
      const isValid = lastDigits === referenceID;
      
      console.log('validateAmountToReference:', {
        amount: amountStr,
        processedAmount: `${integerPart}.${paddedDecimals}`,
        referenceID,
        lastDigits,
        isValid
      });
      
      return isValid;
    } catch (error) {
      console.error('Error validating amount to reference:', error);
      return false;
    }
  }

  // Helper: validateAmountAboveInboundDustThreshold (from memoless.md)
  validateAmountAboveInboundDustThreshold(
    amount: string, 
    dustThreshold: number
  ): boolean {
    try {
      const numericAmount = parseFloat(amount);
      const normalizedDustThreshold = dustThreshold / 1e8; // Convert from raw to asset units
      const isAboveThreshold = numericAmount > normalizedDustThreshold;
      
      console.log('validateAmountAboveInboundDustThreshold:', {
        amount: numericAmount,
        dustThreshold: normalizedDustThreshold,
        isAboveThreshold
      });
      
      return isAboveThreshold;
    } catch (error) {
      console.error('Error validating dust threshold:', error);
      return false;
    }
  }

  // Format user input with reference ID (from memoless.md)
  formatAmountWithReference(
    userInput: string, 
    referenceID: string, 
    assetDecimals: number
  ): AmountValidationResult {
    console.log(`🔢 [MemolessService] Formatting amount with reference encoding...`);
    console.log(`💰 [MemolessService] User input: "${userInput}"`);
    console.log(`🔖 [MemolessService] Reference ID: "${referenceID}" (length: ${referenceID.length})`);
    console.log(`📊 [MemolessService] Asset decimals: ${assetDecimals}`);
    
    try {
      const warnings: string[] = [];
      const errors: string[] = [];
      
      let inputStr = userInput.toString().trim();
      console.log(`🧹 [MemolessService] Trimmed input: "${inputStr}"`);
      
      // Basic validation
      const numericInput = parseFloat(inputStr);
      if (isNaN(numericInput) || numericInput <= 0) {
        return {
          isValid: false,
          processedInput: inputStr,
          finalAmount: '',
          equivalentUSD: '0.00',
          warnings: [],
          errors: ['Amount must be a valid positive number']
        };
      }

      // Calculate reference encoding constraints
      const referenceLength = referenceID.length;
      const maxUserDecimals = Math.max(0, assetDecimals - referenceLength);
      console.log(`📏 [MemolessService] Max user decimals: ${maxUserDecimals} (${assetDecimals} - ${referenceLength})`);
      
      // Handle user input decimal precision
      const [integerPart, decimalPart = ''] = inputStr.split('.');
      console.log(`🧮 [MemolessService] Parsed input - integer: "${integerPart}", decimal: "${decimalPart}"`);
      let processedDecimalPart = decimalPart;
      
      // Truncate if user has too many decimals
      if (decimalPart.length > maxUserDecimals) {
        processedDecimalPart = decimalPart.substring(0, maxUserDecimals);
        warnings.push(`Amount truncated to ${maxUserDecimals} decimals to fit reference ID`);
      }

      // Build final amount: integer + user decimals + padding zeros + reference ID
      const zerosNeeded = Math.max(0, assetDecimals - processedDecimalPart.length - referenceLength);
      const finalDecimalPart = processedDecimalPart + '0'.repeat(zerosNeeded) + referenceID;
      const finalAmount = `${integerPart}.${finalDecimalPart}`;

      // Validate that the base amount is meaningful
      const finalAmountNum = parseFloat(finalAmount);
      const referenceValue = parseInt(referenceID) / Math.pow(10, assetDecimals);
      const baseAmount = finalAmountNum - referenceValue;
      
      if (baseAmount <= 0) {
        return {
          isValid: false,
          processedInput: inputStr,
          finalAmount: finalAmount,
          equivalentUSD: '0.00',
          warnings: warnings,
          errors: ['Amount is too small - the base amount (excluding reference ID) must be greater than 0']
        };
      }

      console.log('formatAmountWithReference:', {
        userInput: inputStr,
        referenceID,
        assetDecimals,
        maxUserDecimals,
        zerosNeeded,
        finalAmount,
        baseAmount
      });

      return {
        isValid: true,
        processedInput: inputStr,
        finalAmount: finalAmount,
        equivalentUSD: '0.00', // Will be calculated separately
        warnings: warnings,
        errors: []
      };
    } catch (error) {
      return {
        isValid: false,
        processedInput: userInput,
        finalAmount: '',
        equivalentUSD: '0.00',
        warnings: [],
        errors: [`Error processing amount: ${(error as Error).message}`]
      };
    }
  }

  // Generate QR code data (Step 8 from memoless.md)
  async generateQRCodeData(chain: string, address: string, amount: string): Promise<QRCodeData> {
    const chainFormatMap: { [key: string]: string } = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BSC': 'ethereum',
      'LTC': 'litecoin',
      'BCH': 'bitcoincash',
      'TRON': 'tron',
      'BASE': 'ethereum',
      'GAIA': 'cosmos',
      'DOGE': 'dogecoin',
      'AVAX': 'avalanche',
      'XRP': 'xrp'
    };

    const qrFormat = chainFormatMap[chain];
    let qrString: string;

    if (qrFormat) {
      if (chain === 'BASE') {
        qrString = `${qrFormat}:${address}@8453?value=${amount}`;
      } else if (chain === 'BSC') {
        qrString = `${qrFormat}:${address}@56?value=${amount}`;
      } else if (qrFormat === 'ethereum') {
        qrString = `${qrFormat}:${address}?value=${amount}`;
      } else {
        qrString = `${qrFormat}:${address}?amount=${amount}`;
      }
    } else {
      // Fallback for unknown chains - just encode the amount
      qrString = amount;
      console.warn(`Unknown chain ${chain} for QR code generation`);
    }

    // Generate the actual QR code image
    let qrCodeDataURL: string | undefined;
    try {
      qrCodeDataURL = await QRCode.toDataURL(qrString, {
        errorCorrectionLevel: 'M',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256
      });
    } catch (error) {
      console.error('Error generating QR code image:', error);
      // QR code image generation failed, but we can still return the string data
    }

    return {
      chain: chain,
      address: address,
      amount: amount,
      qrString: qrString,
      qrCodeDataURL: qrCodeDataURL
    };
  }

  // Convert asset units to raw amount for THORChain API (always use 1e8)
  convertToRawAmount(assetAmount: string, decimals: number): string {
    try {
      // THORChain memo check API always expects amounts in 1e8 format regardless of asset decimals
      const thorchainDecimals = 8;
      
      // Use string manipulation to avoid floating point precision issues
      const [integerPart = '0', decimalPart = ''] = assetAmount.split('.');
      const paddedDecimalPart = decimalPart.padEnd(thorchainDecimals, '0').substring(0, thorchainDecimals);
      const rawAmountStr = integerPart + paddedDecimalPart;
      return parseInt(rawAmountStr.replace(/^0+/, '') || '0').toString();
    } catch (error) {
      console.error('Error converting to raw amount:', error);
      return '0';
    }
  }

  // Calculate estimated time until block expiry (from memoless.md)
  calculateBlockTimeEstimate(currentBlock: number, expiryBlock: number): string {
    // Special case: expiryBlock = 0 means no expiry set
    if (expiryBlock === 0) {
      return 'N/A';
    }
    
    const blockDifference = expiryBlock - currentBlock;
    
    if (blockDifference <= 0) {
      return 'Expired';
    }
    
    // Each block is approximately 6 seconds
    const totalSeconds = blockDifference * 6;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    
    if (totalHours >= 1) {
      return `${totalHours}h`;
    } else if (totalMinutes >= 1) {
      return `${totalMinutes}m`;
    } else {
      return '<1m';
    }
  }

  // Get current THORChain block and calculate expiry time (from memoless.md)
  async getExpiryTimeEstimate(expiryBlock: string): Promise<{ 
    currentBlock: number; 
    expiryBlock: number; 
    timeRemaining: string; 
    blocksRemaining: number 
  }> {
    try {
      // Get current THORChain block using /thorchain/lastblock/THORCHAIN
      const blockData = await this.thorchainApi.getCurrentBlock();
      const currentBlock = blockData[0]?.thorchain || 0;
      const expiryBlockNum = parseInt(expiryBlock);
      const blocksRemaining = expiryBlockNum - currentBlock;
      const timeRemaining = this.calculateBlockTimeEstimate(currentBlock, expiryBlockNum);
      
      console.log('Expiry time calculation:', {
        currentBlock,
        expiryBlock: expiryBlockNum,
        blocksRemaining,
        timeRemaining
      });
      
      return {
        currentBlock: currentBlock,
        expiryBlock: expiryBlockNum,
        timeRemaining: timeRemaining,
        blocksRemaining: blocksRemaining
      };
    } catch (error) {
      console.error('Error calculating expiry time:', error);
      return {
        currentBlock: 0,
        expiryBlock: parseInt(expiryBlock),
        timeRemaining: 'Unknown',
        blocksRemaining: 0
      };
    }
  }

  // Utility functions
  convertUSDToAsset(usdAmount: string, priceUSD: number): string {
    try {
      const usd = parseFloat(usdAmount);
      if (priceUSD <= 0) return '0';
      const assetAmount = usd / priceUSD;
      return assetAmount.toString();
    } catch (error) {
      console.error('Error converting USD to asset:', error);
      return '0';
    }
  }

  convertAssetToUSD(assetAmount: string, priceUSD: number): string {
    try {
      const asset = parseFloat(assetAmount);
      const usdValue = asset * priceUSD;
      return usdValue.toFixed(2);
    } catch (error) {
      console.error('Error converting asset to USD:', error);
      return '0.00';
    }
  }

  getAssetDecimals(asset: string): number {
    return TransactionService.getAssetDecimals(asset);
  }

  getAssetChain(asset: string): string {
    return asset.split('.')[0];
  }
}
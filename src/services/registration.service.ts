import { MemolessService } from './memoless.service';
import { ThorchainApiService } from './thorchain-api.service';
import { WalletService } from './wallet.service';
import { TransactionService } from './transaction.service';
import { DatabaseService, RegistrationRecord } from './database.service';
import { MemoParserService } from './memo-parser.service';
import { NotificationService, NotificationPayload, FailureNotificationPayload, LowBalanceAlertPayload } from './notification.service';
import { NetworkConfig, QRCodeData } from '../types';

export interface RegistrationRequest {
  asset: string;
  memo: string;
  requested_in_asset_amount?: string | number;
}

export interface RegistrationResponse {
  success: boolean;
  internal_api_id: string;
  asset: string;
  memo: string;
  reference: string;
  reference_length: number;
  height: string;
  registration_hash: string;
  registered_by: string;
  txHash: string;
  decimals: number;
  minimum_amount_to_send: string;
  suggested_in_asset_amount?: string;
}

export interface ValidationResult {
  isValid: boolean;
  processedAmount: string;
  rawAmount: string;
  validationDetails: {
    referenceId: string;
    referenceMatches: boolean;
    aboveDustThreshold: boolean;
    thorchainValidation: any;
    timeRemaining: string;
    currentBlock: number;
    blocksRemaining: number;
  };
  errors: string[];
}

export interface PreflightRequest {
  internal_api_id?: string;
  asset?: string;
  reference?: string;
  amount: string;
  inputType?: 'asset' | 'usd';
}

export interface PreflightResult extends ValidationResult {
  asset: string;
  reference: string;
  decimals: number;
  memo?: string;
  usage: {
    current_uses: number;
    max_uses: number;
    available: boolean;
  };
  deposit?: {
    inbound_address: string;
    chain: string;
    dust_threshold: number;
    qr_code: QRCodeData;
  };
}

export class RegistrationService {
  private memolessService: MemolessService;
  private walletService: WalletService;
  private databaseService: DatabaseService;
  private notificationService: NotificationService;
  private memoParserService: MemoParserService;
  private config: NetworkConfig;

  constructor(
    memolessService: MemolessService,
    walletService: WalletService,
    databaseService: DatabaseService,
    notificationService: NotificationService,
    config: NetworkConfig
  ) {
    this.memolessService = memolessService;
    this.walletService = walletService;
    this.databaseService = databaseService;
    this.notificationService = notificationService;
    this.memoParserService = new MemoParserService();
    this.config = config;
  }

  async initialize(): Promise<void> {
    await this.walletService.initialize(process.env.HOT_WALLET_MNEMONIC!);
    await this.databaseService.initialize();
  }

  // Get valid assets - delegates to legacy service
  async getValidAssets() {
    return await this.memolessService.getValidAssetsForRegistration();
  }

  // Main registration method
  async registerMemo(request: RegistrationRequest): Promise<RegistrationResponse> {
    console.log(`📝 [RegistrationService] Starting memo registration...`);
    console.log(`🪙 [RegistrationService] Asset: ${request.asset}`);
    console.log(`📋 [RegistrationService] Memo: ${request.memo}`);
    
    // 1. Get asset decimals (async, non-blocking)
    console.log(`📊 [RegistrationService] Step 1: Fetching asset decimals...`);
    const assetDecimalsPromise = this.getAssetDecimalsAsync(request.asset);
    console.log(`✅ [RegistrationService] Asset decimals fetch started asynchronously`);
    
    // 2. Validate inputs
    console.log(`🔍 [RegistrationService] Step 2: Validating registration request...`);
    await this.validateRegistrationRequest(request);
    console.log(`✅ [RegistrationService] Registration request validation passed`);

    // 3. Check hot wallet has sufficient funds
    console.log(`💰 [RegistrationService] Step 3: Checking hot wallet balance...`);
    try {
      const balance = await this.walletService.getBalance();
      const address = this.walletService.getAddress();
      const balanceFloat = parseFloat(balance);
      if (balanceFloat < 0.02) {
        console.log(`❌ [RegistrationService] Insufficient funds in hot wallet`);
        console.log(`💰 [RegistrationService] Current balance: ${balance} RUNE`);
        console.log(`📍 [RegistrationService] Hot wallet address: ${address}`);
        throw new Error(`Hot wallet has insufficient RUNE for transaction fees. Current balance: ${balance} RUNE. Please fund address: ${address}`);
      }
      console.log(`✅ [RegistrationService] Hot wallet has sufficient funds`);
    } catch (error) {
      console.log(`⚠️ [RegistrationService] Could not check wallet balance, proceeding anyway`);
    }

    // 4. Skip duplicate check - each registration is unique
    console.log(`✅ [RegistrationService] Step 4: Skipping duplicate check - each registration is unique`);

    // 5. Process memo for affiliate injection (if enabled)
    console.log(`🔧 [RegistrationService] Step 5: Processing memo for affiliate injection...`);
    const processedMemo = await this.processAffiliateInjection(request.memo);
    console.log(`📝 [RegistrationService] Original memo: ${request.memo}`);
    console.log(`📝 [RegistrationService] Processed memo: ${processedMemo}`);

    // 6. Register memo using memoless service
    console.log(`🚀 [RegistrationService] Step 6: Registering memo on THORChain...`);
    let txHash: string;
    try {
      txHash = await this.memolessService.registerMemo(request.asset, processedMemo);
      console.log(`📊 [RegistrationService] Transaction hash: ${txHash}`);
    } catch (error) {
      console.error(`❌ [RegistrationService] Failed to register memo on THORChain:`, error);
      
      // Send failure notification if enabled
      if (this.notificationService.isAnyNotificationEnabled()) {
        try {
          console.log(`🔔 [RegistrationService] Sending failure notification...`);
          
          // Get current RUNE balance and calculate registrations remaining
          let runeBalance: string | undefined;
          let registrationsRemaining: number | undefined;
          
          try {
            const balance = await this.walletService.getBalance();
            runeBalance = balance ? parseFloat(balance).toFixed(2) : undefined;
            
            if (balance) {
              try {
                const memolessTxCost = await this.getMemolessTxCostFromMemolessService();
                registrationsRemaining = this.calculateRegistrationsRemaining(balance, memolessTxCost);
              } catch (memolessError) {
                console.error(`❌ [RegistrationService] Failed to get memoless TX cost: ${(memolessError as Error).message}`);
                registrationsRemaining = 0; // Set to 0 when unable to calculate
              }
            }
          } catch (balanceError) {
            console.log(`⚠️  [RegistrationService] Could not calculate registrations remaining: ${(balanceError as Error).message}`);
          }

          const failurePayload: FailureNotificationPayload = {
            txHash: 'Transaction failed to submit',
            asset: request.asset,
            memo: request.memo,
            error: 'Failed to submit transaction to THORChain',
            errorDetails: (error as Error).message,
            network: this.config.network,
            hotWalletAddress: this.walletService.getAddress(),
            hotWalletRuneBalance: runeBalance,
            registrationsRemaining,
            timestamp: new Date().toISOString()
          };

          await this.notificationService.sendFailureNotification(failurePayload);
          console.log(`✅ [RegistrationService] Failure notification sent`);
        } catch (notificationError) {
          console.error(`❌ [RegistrationService] Failed to send failure notification: ${(notificationError as Error).message}`);
        }
      }
      
      throw error; // Re-throw the original error
    }

    // 7. Immediately check memo reference
    console.log(`🔍 [RegistrationService] Step 7: Checking memo reference...`);
    let memoReference;
    try {
      memoReference = await this.memolessService.getMemoReference(txHash);
      console.log(`📋 [RegistrationService] Memo reference retrieved:`, memoReference);
    } catch (error) {
      console.error(`❌ [RegistrationService] Failed to get memo reference:`, error);
      
      // Send failure notification if enabled
      if (this.notificationService.isAnyNotificationEnabled()) {
        try {
          console.log(`🔔 [RegistrationService] Sending failure notification...`);
          
          // Get current RUNE balance and calculate registrations remaining
          let runeBalance: string | undefined;
          let registrationsRemaining: number | undefined;
          
          try {
            const balance = await this.walletService.getBalance();
            runeBalance = balance ? parseFloat(balance).toFixed(2) : undefined;
            
            if (balance) {
              try {
                const memolessTxCost = await this.getMemolessTxCostFromMemolessService();
                registrationsRemaining = this.calculateRegistrationsRemaining(balance, memolessTxCost);
              } catch (memolessError) {
                console.error(`❌ [RegistrationService] Failed to get memoless TX cost: ${(memolessError as Error).message}`);
                registrationsRemaining = 0; // Set to 0 when unable to calculate
              }
            }
          } catch (balanceError) {
            console.log(`⚠️  [RegistrationService] Could not calculate registrations remaining: ${(balanceError as Error).message}`);
          }

          const failurePayload: FailureNotificationPayload = {
            txHash,
            asset: request.asset,
            memo: request.memo,
            error: 'Failed to retrieve memo reference after transaction',
            errorDetails: (error as Error).message,
            network: this.config.network,
            hotWalletAddress: this.walletService.getAddress(),
            hotWalletRuneBalance: runeBalance,
            registrationsRemaining,
            timestamp: new Date().toISOString()
          };

          await this.notificationService.sendFailureNotification(failurePayload);
          console.log(`✅ [RegistrationService] Failure notification sent`);
        } catch (notificationError) {
          console.error(`❌ [RegistrationService] Failed to send failure notification: ${(notificationError as Error).message}`);
        }
      }
      
      throw new Error(`Registration successful but failed to retrieve memo details: ${(error as Error).message}`);
    }

    // 8. Get asset decimals and calculate minimum amount
    console.log(`📊 [RegistrationService] Step 8: Getting asset decimals and calculating minimum amount...`);
    const assetDecimals = await assetDecimalsPromise;
    const minimumAmountToSend = this.calculateMinimumAmountToSend(memoReference.reference, assetDecimals);
    console.log(`📐 [RegistrationService] Asset decimals: ${assetDecimals}`);
    console.log(`💰 [RegistrationService] Minimum amount to send: ${minimumAmountToSend}`);

    // 9. Store registration record with confirmed status
    console.log(`💾 [RegistrationService] Step 9: Storing confirmed registration in database...`);
    const registrationId = await this.databaseService.createRegistration({
      txHash,
      asset: request.asset,
      memo: request.memo,
      status: 'confirmed',
      referenceId: memoReference.reference,
      height: memoReference.height,
      registrationHash: memoReference.registration_hash,
      registeredBy: memoReference.registered_by
    });
    console.log(`🆔 [RegistrationService] Registration ID: ${registrationId}`);
    
    // 10. Send notification if enabled
    if (this.notificationService.isAnyNotificationEnabled()) {
      try {
        console.log(`🔔 [RegistrationService] Step 10: Sending notifications...`);
        
        // Get current RUNE balance and calculate registrations remaining
        let runeBalance: string | undefined;
        let registrationsRemaining: number | undefined;
        
        try {
          const balance = await this.walletService.getBalance();
          runeBalance = balance ? parseFloat(balance).toFixed(2) : undefined;
          
          if (balance) {
            // Get memoless transaction cost and calculate remaining registrations
            try {
              const memolessTxCost = await this.getMemolessTxCostFromMemolessService();
              registrationsRemaining = this.calculateRegistrationsRemaining(balance, memolessTxCost);
              console.log(`🧮 [RegistrationService] Calculated ${registrationsRemaining} registrations remaining`);
            } catch (memolessError) {
              console.error(`❌ [RegistrationService] Failed to get memoless TX cost: ${(memolessError as Error).message}`);
              registrationsRemaining = 0; // Set to 0 when unable to calculate
            }
          }
        } catch (error) {
          console.log(`⚠️  [RegistrationService] Could not calculate registrations remaining: ${(error as Error).message}`);
        }

        const notificationPayload: NotificationPayload = {
          registrationId,
          txHash,
          asset: request.asset,
          memo: request.memo,
          referenceId: memoReference.reference,
          network: this.config.network,
          hotWalletAddress: this.walletService.getAddress(),
          hotWalletRuneBalance: runeBalance,
          registrationsRemaining,
          timestamp: new Date().toISOString()
        };

        await this.notificationService.sendRegistrationNotification(notificationPayload);
        console.log(`✅ [RegistrationService] Notifications sent`);

        // Check for low balance alert
        if (registrationsRemaining !== undefined && this.notificationService.shouldSendLowBalanceAlert(registrationsRemaining)) {
          try {
            console.log(`🚨 [RegistrationService] Triggering low balance alert - ${registrationsRemaining} registrations remaining`);
            
            const memolessTxCost = await this.getMemolessTxCostFromMemolessService();
            const networkTxFee = 0.02;
            const totalRegistrationCost = memolessTxCost + networkTxFee;
            
            const lowBalancePayload: LowBalanceAlertPayload = {
              network: this.config.network,
              hotWalletAddress: this.walletService.getAddress(),
              runeBalance: runeBalance || '0',
              registrationsRemaining,
              memolessTxCost,
              networkTxFee,
              totalRegistrationCost,
              threshold: parseInt(process.env.LOW_BALANCE_ALERT_THRESHOLD || '25'),
              timestamp: new Date().toISOString()
            };

            await this.notificationService.sendLowBalanceAlert(lowBalancePayload);
            console.log(`🚨 [RegistrationService] Low balance alert sent`);
          } catch (alertError) {
            console.error(`❌ [RegistrationService] Failed to send low balance alert: ${(alertError as Error).message}`);
            // Don't fail the registration if low balance alert fails
          }
        }
      } catch (error) {
        console.error(`❌ [RegistrationService] Failed to send notifications: ${(error as Error).message}`);
        // Don't fail the registration if notification fails
      }
    }

    // 11. Calculate suggested amount if requested
    let suggestedAmount: string | undefined;
    if (request.requested_in_asset_amount) {
      console.log(`🧮 [RegistrationService] Step 11: Calculating suggested amount...`);
      try {
        // Convert to string to handle both string and number inputs
        const requestedAmountStr = typeof request.requested_in_asset_amount === 'number' 
          ? request.requested_in_asset_amount.toString() 
          : request.requested_in_asset_amount;
        
        suggestedAmount = this.calculateSuggestedAmount(
          requestedAmountStr,
          minimumAmountToSend,
          memoReference.reference,
          assetDecimals
        );
        console.log(`✅ [RegistrationService] Suggested amount calculated: ${suggestedAmount}`);
      } catch (error) {
        console.error(`❌ [RegistrationService] Failed to calculate suggested amount:`, error);
        // Don't fail the registration if suggestion calculation fails
      }
    }

    // Return complete memo reference data with decimals and minimum amount
    return {
      success: true,
      internal_api_id: registrationId,
      asset: memoReference.asset,
      memo: memoReference.memo,
      reference: memoReference.reference,
      reference_length: memoReference.reference.length,
      height: memoReference.height,
      registration_hash: memoReference.registration_hash,
      registered_by: memoReference.registered_by,
      txHash,
      decimals: assetDecimals,
      minimum_amount_to_send: minimumAmountToSend,
      ...(suggestedAmount && { suggested_in_asset_amount: suggestedAmount })
    };
  }


  // Get registration status
  async getRegistrationStatus(registrationId: string): Promise<RegistrationRecord | null> {
    if (!this.databaseService.isDatabaseEnabled()) {
      throw new Error('Database is disabled. Registration status lookup is not available without persistent storage.');
    }
    return await this.databaseService.getRegistration(registrationId);
  }

  // New preflight check method - supports internal_api_id OR asset+reference
  async preflightCheck(request: PreflightRequest): Promise<PreflightResult> {
    console.log(`🚁 [RegistrationService] Starting preflight check...`);
    
    let asset: string | undefined;
    let reference: string | undefined;
    let decimals: number;
    let registration: any;

    // Priority: Use asset+reference if provided, otherwise use internal_api_id
    if (request.asset && request.reference) {
      console.log(`🔍 [RegistrationService] Using provided asset: ${request.asset}, reference: ${request.reference}`);
      asset = request.asset;
      reference = request.reference;
    } 
    // Fallback: Use internal_api_id to lookup asset and reference
    else if (request.internal_api_id) {
      console.log(`🔍 [RegistrationService] Looking up by internal API ID: ${request.internal_api_id}`);
      
      // Check if database is enabled
      if (!this.databaseService.isDatabaseEnabled()) {
        throw new Error('Database is disabled. Cannot lookup registrations by internal_api_id. Please use "asset" and "reference" parameters instead for preflight checks.');
      }
      
      registration = await this.databaseService.getRegistration(request.internal_api_id);
      
      if (!registration || !registration.referenceId) {
        throw new Error('Registration not found or not confirmed');
      }
      
      asset = registration.asset;
      reference = registration.referenceId;
    }
    
    // Validate that we have both asset and reference
    if (!asset || !reference) {
      throw new Error('Unable to determine asset and reference from request parameters');
    }
    
    // Type assertion after validation
    const validatedAsset: string = asset;
    const validatedReference: string = reference;
    
    // Always get current decimals from pools API to ensure accuracy
    decimals = await this.getAssetDecimalsAsync(validatedAsset);

    console.log(`📊 [RegistrationService] Preflight parameters - Asset: ${validatedAsset}, Reference: ${validatedReference}, Decimals: ${decimals}`);

    // Get usage statistics from THORChain memo check API
    console.log(`📈 [RegistrationService] Getting usage statistics from THORChain...`);
    const usageStats = await this.getMemoUsageStats(validatedAsset, validatedReference, decimals);

    // Validate THORChain memo check response according to preflight rules
    console.log(`🔍 [RegistrationService] Validating THORChain memo check response...`);
    const thorchainValidation = this.validateThorchainMemoResponse(usageStats);
    if (!thorchainValidation.isValid) {
      console.log(`❌ [RegistrationService] THORChain validation failed:`, thorchainValidation.errors);
      return {
        isValid: false,
        processedAmount: request.amount,
        rawAmount: '0',
        validationDetails: {
          referenceId: validatedReference,
          referenceMatches: false,
          aboveDustThreshold: false,
          thorchainValidation: thorchainValidation,
          timeRemaining: 'No expiry',
          currentBlock: 0,
          blocksRemaining: 0
        },
        errors: thorchainValidation.errors,
        asset: validatedAsset,
        reference: validatedReference,
        decimals,
        memo: usageStats.memo || '',
        usage: {
          current_uses: usageStats.usage_count,
          max_uses: usageStats.max_use,
          available: usageStats.available
        }
      };
    }

    // Perform the validation using existing validateAmount logic
    console.log(`✅ [RegistrationService] Performing amount validation...`);
    
    // Create a temporary registration object for validation if needed
    if (!registration) {
      registration = {
        asset: validatedAsset,
        referenceId: validatedReference,
        decimals,
        dustThreshold: 1000, // Default dust threshold
        priceUSD: 0
      };
    }

    // For preflight checks, validate the user's EXACT input amount against THORChain
    // Don't modify the amount - use it as-is for the memo/check call
    console.log(`🧪 [RegistrationService] Preflight: Using exact user input "${request.amount}" for THORChain validation`);
    
    const validation = await this.validateAmountForPreflight(registration, request.amount, 'asset', usageStats.expires_at, thorchainValidation);

    // Build the preflight result
    const result: PreflightResult = {
      ...validation,
      asset: validatedAsset,
      reference: validatedReference,
      decimals,
      memo: usageStats.memo,
      usage: {
        current_uses: usageStats.usage_count,
        max_uses: usageStats.max_use,
        available: usageStats.available
      }
    };

    // If the amount is valid, add deposit information and QR code
    if (result.isValid) {
      try {
        console.log(`💰 [RegistrationService] Amount is valid, getting inbound address and generating QR code...`);
        
        // Get inbound addresses using memoless service
        const inboundAddresses = await this.memolessService.getInboundAddresses();
        const depositInfo = this.memolessService.getInboundAddressForAsset(inboundAddresses, validatedAsset);
        
        // Get the chain from the asset
        const chain = validatedAsset.split('.')[0];
        
        // Generate QR code using the validated amount
        const qrData = await this.memolessService.generateQRCodeData(
          chain,
          depositInfo.address,
          result.processedAmount
        );
        
        result.deposit = {
          inbound_address: depositInfo.address,
          chain: chain,
          dust_threshold: depositInfo.dustThreshold,
          qr_code: qrData
        };
        
        console.log(`✅ [RegistrationService] Added deposit info - Address: ${depositInfo.address}, Chain: ${chain}`);
      } catch (error) {
        console.warn(`⚠️ [RegistrationService] Could not get deposit info:`, error);
        // Continue without deposit info if there's an error
      }
    }

    console.log(`🚁 [RegistrationService] Preflight check complete - Valid: ${result.isValid}, Current uses: ${result.usage.current_uses}/${result.usage.max_uses}`);
    return result;
  }

  // Get memo usage statistics from THORChain API
  private async getMemoUsageStats(asset: string, reference: string, decimals: number): Promise<{
    usage_count: number;
    max_use: number;
    available: boolean;
    memo?: string;
    expires_at?: string;
  }> {
    try {
      // Use the same calculation logic as in calculateMinimumAmountToSend
      // This ensures we're checking the exact amount that would be used for registration
      const testAmount = this.calculateMinimumAmountToSend(reference, decimals);
      
      console.log(`🧪 [RegistrationService] Usage stats test amount for ${asset}: "${testAmount}" (decimals: ${decimals}, reference: "${reference}")`);
      console.log(`🔬 [RegistrationService] Expected behavior: THORChain should find a registered memo for this amount/asset combination`);
      
      const memoCheck = await this.memolessService.validateMemoRegistration(
        asset, 
        testAmount, 
        decimals, 
        '', // We don't need the memo for usage stats
        reference
      );
      console.log(`📊 [RegistrationService] THORChain memo check result:`, {
        reference: memoCheck.memoCheck.reference,
        available: memoCheck.memoCheck.available,
        can_register: memoCheck.memoCheck.can_register,
        memo: memoCheck.memoCheck.memo,
        expires_at: memoCheck.memoCheck.expires_at
      });
      
      return {
        usage_count: parseInt(memoCheck.memoCheck.usage_count || '0'),
        max_use: parseInt(memoCheck.memoCheck.max_use || '3'),
        available: memoCheck.memoCheck.available || false,
        memo: memoCheck.memoCheck.memo,
        expires_at: memoCheck.memoCheck.expires_at
      };
    } catch (error) {
      console.warn(`⚠️ [RegistrationService] Could not get usage stats, using defaults:`, error);
      return {
        usage_count: 0,
        max_use: 3,
        available: true
      };
    }
  }

  // Internal validation method that can work with any registration object
  private async validateAmountInternal(registration: any, amount: string, inputType: 'asset' | 'usd', expiresAt?: string): Promise<ValidationResult> {
    const decimals = registration.decimals || 8;
    const dustThreshold = registration.dustThreshold || 1000;

    // Convert USD to asset if needed
    let assetAmount = amount;
    if (inputType === 'usd' && registration.priceUSD) {
      assetAmount = this.memolessService.convertUSDToAsset(amount, registration.priceUSD);
    }

    // Use legacy validation methods
    const referenceValid = this.memolessService.validateAmountToReference(
      assetAmount, 
      registration.referenceId, 
      decimals
    );

    const dustValid = this.memolessService.validateAmountAboveInboundDustThreshold(
      assetAmount, 
      dustThreshold
    );

    // Format amount with reference
    const formatResult = this.memolessService.formatAmountWithReference(
      assetAmount, 
      registration.referenceId, 
      decimals
    );

    if (!formatResult.isValid) {
      return {
        isValid: false,
        processedAmount: assetAmount,
        rawAmount: '0',
        validationDetails: {} as any,
        errors: formatResult.errors
      };
    }

    // Get raw amount for response
    const rawAmount = TransactionService.convertToBaseUnits(formatResult.finalAmount, registration.asset);

    // Get time remaining using expires_at from THORChain API
    const timeInfo = await this.memolessService.getExpiryTimeEstimate(expiresAt || '0');

    return {
      isValid: referenceValid && dustValid,
      processedAmount: formatResult.finalAmount,
      rawAmount,
      validationDetails: {
        referenceId: registration.referenceId,
        referenceMatches: referenceValid,
        aboveDustThreshold: dustValid,
        thorchainValidation: null, // No longer validating memo
        timeRemaining: timeInfo.timeRemaining,
        currentBlock: timeInfo.currentBlock,
        blocksRemaining: timeInfo.blocksRemaining
      },
      errors: []
    };
  }

  // Validate amount using legacy service
  async validateAmount(registrationId: string, amount: string, inputType: 'asset' | 'usd' = 'asset'): Promise<ValidationResult> {
    const registration = await this.databaseService.getRegistration(registrationId);
    if (!registration || !registration.referenceId) {
      throw new Error('Registration not found or not confirmed');
    }

    return await this.validateAmountInternal(registration, amount, inputType, registration.expiresAt);
  }

  // Validate THORChain memo check response according to preflight rules
  private validateThorchainMemoResponse(usageStats: {
    usage_count: number;
    max_use: number;
    available: boolean;
    memo?: string;
    expires_at?: string;
  }): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Rule 1: can_register should be false (memo should already be registered)
    // Note: We check via available flag - if available=true, it means it CAN be registered (bad)
    if (usageStats.available === true) {
      errors.push('Reference ID is not registered yet - available for registration');
    }

    // Rule 2: If usage count equals max use, fail the preflight
    if (usageStats.usage_count >= usageStats.max_use) {
      errors.push(`Reference ID has reached maximum usage (${usageStats.usage_count}/${usageStats.max_use})`);
    }

    // Rule 3: expires_at should not be 0 (should have valid expiry)
    if (!usageStats.expires_at || usageStats.expires_at === '0') {
      errors.push('Reference ID has no valid expiry time');
    }

    console.log(`🔍 [RegistrationService] THORChain validation - Available: ${usageStats.available}, Usage: ${usageStats.usage_count}/${usageStats.max_use}, Expires: ${usageStats.expires_at}`);
    console.log(`📊 [RegistrationService] Validation result: ${errors.length === 0 ? 'PASS' : 'FAIL'}, Errors: ${errors}`);

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Special validation for preflight checks - uses exact user input amount for THORChain validation  
  private async validateAmountForPreflight(registration: any, amount: string, inputType: 'asset', expiresAt?: string, thorchainValidation?: { isValid: boolean; errors: string[] }): Promise<ValidationResult> {
    console.log(`🧪 [RegistrationService] Preflight validation - Amount: "${amount}", Asset: ${registration.asset}`);
    
    // Convert amount to base units for THORChain API call using EXACT user input
    const rawAmount = TransactionService.convertToBaseUnits(amount, registration.asset);
    console.log(`🔢 [RegistrationService] Preflight - Raw amount for THORChain: ${rawAmount} (from input: "${amount}")`);
    
    // Check dust threshold using exact user input
    const dustValid = parseFloat(rawAmount) > (registration.dustThreshold || 1000);
    console.log(`💨 [RegistrationService] Preflight dust check - Amount: ${rawAmount}, Threshold: ${registration.dustThreshold || 1000}, Valid: ${dustValid}`);
    
    // Check if the amount contains the reference ID in the last digits
    const referenceValid = this.checkReferenceInAmount(amount, registration.referenceId, registration.decimals);
    console.log(`🔍 [RegistrationService] Preflight reference check - Reference: ${registration.referenceId}, Valid: ${referenceValid}`);
    
    // Get time remaining using expires_at from THORChain API
    const timeInfo = await this.memolessService.getExpiryTimeEstimate(expiresAt || '0');
    
    // Combine all errors
    const allErrors: string[] = [];
    if (thorchainValidation && !thorchainValidation.isValid) {
      allErrors.push(...thorchainValidation.errors);
    }

    return {
      isValid: referenceValid && dustValid && (thorchainValidation ? thorchainValidation.isValid : true),
      processedAmount: amount, // Use exact user input, not modified amount
      rawAmount,
      validationDetails: {
        referenceId: registration.referenceId,
        referenceMatches: referenceValid,
        aboveDustThreshold: dustValid,
        thorchainValidation: thorchainValidation || null,
        timeRemaining: timeInfo.timeRemaining,
        currentBlock: timeInfo.currentBlock,
        blocksRemaining: timeInfo.blocksRemaining
      },
      errors: allErrors
    };
  }

  // Helper method to check if amount contains reference ID in last digits
  private checkReferenceInAmount(amount: string, referenceId: string, decimals: number): boolean {
    try {
      const [, decimalPart = ''] = amount.split('.');
      if (decimalPart.length === 0) return false;
      
      const referenceLength = referenceId.length;
      if (decimalPart.length < referenceLength) return false;
      
      const lastDigits = decimalPart.slice(-referenceLength);
      const matches = lastDigits === referenceId;
      
      console.log(`🔍 [RegistrationService] Reference check - Decimal part: "${decimalPart}", Last ${referenceLength} digits: "${lastDigits}", Expected: "${referenceId}", Matches: ${matches}`);
      return matches;
    } catch (error) {
      console.error('Error checking reference in amount:', error);
      return false;
    }
  }

  // Generate QR code using legacy service
  async generateQRCode(registrationId: string, amount: string) {
    const registration = await this.databaseService.getRegistration(registrationId);
    if (!registration?.inboundAddress || !registration?.chain) {
      throw new Error('Registration not ready for QR generation');
    }

    return await this.memolessService.generateQRCodeData(
      registration.chain,
      registration.inboundAddress,
      amount
    );
  }

  private async validateRegistrationRequest(request: RegistrationRequest): Promise<void> {
    // No validation needed - if asset is invalid, THORChain will reject the registration
    // This eliminates unnecessary /thorchain/pools API calls
  }

  async setNetwork(config: NetworkConfig): Promise<void> {
    this.config = config;
    this.memolessService.updateNetwork(config);
    this.walletService.updateNetwork(config);
  }

  // Get asset decimals from /pools endpoint
  private async getAssetDecimalsAsync(asset: string): Promise<number> {
    try {
      console.log(`🔍 [RegistrationService] Fetching decimals for asset: ${asset}`);
      const validAssets = await this.memolessService.getValidAssetsForRegistration();
      const assetInfo = validAssets.find(a => a.asset === asset);
      
      if (!assetInfo) {
        console.warn(`⚠️ [RegistrationService] Asset ${asset} not found in pools, defaulting to 8 decimals`);
        return 8; // Default as per memoless.md
      }
      
      const decimals = assetInfo.decimals || 8;
      console.log(`📊 [RegistrationService] Found ${decimals} decimals for ${asset}`);
      return decimals;
    } catch (error) {
      console.error(`❌ [RegistrationService] Error fetching decimals for ${asset}:`, error);
      return 8; // Default fallback
    }
  }

  // Calculate minimum amount to send based on reference ID and decimals
  private calculateMinimumAmountToSend(referenceId: string, decimals: number): string {
    console.log(`🧮 [RegistrationService] Calculating minimum amount...`);
    console.log(`🔢 [RegistrationService] Reference ID: "${referenceId}" (length: ${referenceId.length})`);
    console.log(`📊 [RegistrationService] Asset decimals: ${decimals}`);
    
    const referenceLength = referenceId.length;
    
    // From memoless.md: The minimum occurs when the digit right before the reference ID is "1"
    // If reference is "00010" (5 digits) and decimals is 8:
    // Amount format: x.xxx{referenceId}
    // Minimum: x.xxx100010 where the digit before reference (position 4) is "1"
    
    if (referenceLength >= decimals) {
      // Edge case: reference is same length or longer than decimals
      // Minimum would be 1.{referenceId} but truncated to decimals
      const truncatedReference = referenceId.substring(0, decimals);
      const result = `1.${truncatedReference}`;
      console.log(`⚠️ [RegistrationService] Reference length (${referenceLength}) >= decimals (${decimals})`);
      console.log(`💰 [RegistrationService] Minimum amount (truncated): ${result}`);
      return result;
    }
    
    // Normal case: build minimum amount with "1" in the position right before reference
    // Decimal structure: {user_digits}.{padding_zeros}1{referenceId}
    const paddingZeros = decimals - referenceLength - 1; // -1 for the "1" digit
    
    if (paddingZeros < 0) {
      // Not enough decimal places for padding and "1"
      // Put "1" at the start of decimals, then reference
      const result = `0.1${referenceId.substring(0, decimals - 1)}`;
      console.log(`⚠️ [RegistrationService] Not enough decimal places for padding`);
      console.log(`💰 [RegistrationService] Minimum amount (compact): ${result}`);
      return result;
    }
    
    // Build: 0.{padding_zeros}1{referenceId}
    const decimalPart = '0'.repeat(paddingZeros) + '1' + referenceId;
    const result = `0.${decimalPart}`;
    
    console.log(`📐 [RegistrationService] Padding zeros: ${paddingZeros}`);
    console.log(`🔢 [RegistrationService] Decimal part: "${decimalPart}"`);
    console.log(`💰 [RegistrationService] Minimum amount: ${result}`);
    
    return result;
  }

  // Calculate suggested amount based on requested amount and reference embedding
  private calculateSuggestedAmount(
    requestedAmount: string,
    minimumAmount: string,
    referenceId: string,
    decimals: number
  ): string {
    console.log(`🧮 [RegistrationService] Calculating suggested amount...`);
    console.log(`💰 [RegistrationService] Requested: ${requestedAmount}`);
    console.log(`🔢 [RegistrationService] Reference: "${referenceId}" (length: ${referenceId.length})`);
    console.log(`📊 [RegistrationService] Decimals: ${decimals}`);
    
    // Step 1: Check minimum threshold
    const requestedFloat = parseFloat(requestedAmount);
    const minimumFloat = parseFloat(minimumAmount);
    
    if (requestedFloat < minimumFloat) {
      console.log(`⬆️  [RegistrationService] Requested (${requestedAmount}) below minimum (${minimumAmount})`);
      console.log(`💰 [RegistrationService] Suggested amount: ${minimumAmount}`);
      return minimumAmount;
    }
    
    // Step 2: Normalize requested amount to asset decimals (truncate, don't round)
    const [integerPart, decimalPart = ''] = requestedAmount.split('.');
    const truncatedDecimal = decimalPart.substring(0, decimals).padEnd(decimals, '0');
    const normalizedRequested = `${integerPart}.${truncatedDecimal}`;
    
    console.log(`📐 [RegistrationService] Normalized requested: ${normalizedRequested}`);
    
    // Step 3: Handle reference embedding
    const referenceLength = referenceId.length;
    
    if (referenceLength > decimals) {
      // Edge case: Truncate reference to fit decimals
      const truncatedReference = referenceId.substring(0, decimals);
      const result = `${integerPart}.${truncatedReference}`;
      console.log(`⚠️  [RegistrationService] Reference too long, truncated: ${result}`);
      return result;
    }
    
    // Step 4: Embed reference in last positions
    const baseDecimal = truncatedDecimal.substring(0, decimals - referenceLength);
    let candidate = `${integerPart}.${baseDecimal}${referenceId}`;
    
    console.log(`🔧 [RegistrationService] Initial candidate: ${candidate}`);
    
    // Step 5: Ensure suggested > requested by incrementing if needed
    while (parseFloat(candidate) <= parseFloat(normalizedRequested)) {
      console.log(`⬆️  [RegistrationService] Incrementing: ${candidate} <= ${normalizedRequested}`);
      candidate = this.incrementBeforeReference(candidate, referenceId, decimals);
      console.log(`🔢 [RegistrationService] New candidate: ${candidate}`);
    }
    
    console.log(`✅ [RegistrationService] Final suggested amount: ${candidate}`);
    return candidate;
  }

  // Helper method to increment the digit before the reference ID
  private incrementBeforeReference(amount: string, referenceId: string, decimals: number): string {
    const [integerPart, decimalPart] = amount.split('.');
    const referenceLength = referenceId.length;
    
    // Get the part before the reference
    const beforeReference = decimalPart.substring(0, decimals - referenceLength);
    
    // Convert to number, increment, and handle carry-over
    let beforeNum = parseInt(beforeReference || '0');
    beforeNum += 1;
    
    // Handle carry-over to integer part
    const maxBeforeValue = Math.pow(10, decimals - referenceLength) - 1;
    if (beforeNum > maxBeforeValue) {
      // Carry over to integer part
      const newInteger = (parseInt(integerPart) + 1).toString();
      const newBefore = '0'.repeat(decimals - referenceLength);
      return `${newInteger}.${newBefore}${referenceId}`;
    }
    
    // Pad with zeros to maintain length
    const paddedBefore = beforeNum.toString().padStart(decimals - referenceLength, '0');
    return `${integerPart}.${paddedBefore}${referenceId}`;
  }

  /**
   * Process affiliate injection based on environment variables
   * Returns modified memo if injection is enabled and successful, otherwise returns original memo
   */
  private async processAffiliateInjection(originalMemo: string): Promise<string> {
    try {
      // Check if affiliate injection is enabled
      const injectAffiliate = process.env.INJECT_AFFILIATE_IN_SWAPS === 'true';
      if (!injectAffiliate) {
        console.log(`🔧 [RegistrationService] Affiliate injection disabled via INJECT_AFFILIATE_IN_SWAPS`);
        return originalMemo;
      }

      // Get affiliate configuration from environment
      const affiliateThorname = process.env.AFFILIATE_THORNAME;
      const affiliateFeeBp = process.env.AFFILIATE_FEE_BP || '5';

      if (!affiliateThorname) {
        console.warn(`⚠️ [RegistrationService] AFFILIATE_THORNAME not configured, skipping injection`);
        return originalMemo;
      }

      // Check if it's a swap memo
      if (!this.memoParserService.isSwapMemo(originalMemo)) {
        console.log(`🔧 [RegistrationService] Memo is not a swap, skipping affiliate injection`);
        return originalMemo;
      }

      console.log(`🔧 [RegistrationService] Injecting affiliate - THORName: ${affiliateThorname}, Fee: ${affiliateFeeBp} BP`);
      
      // Attempt to modify the memo with affiliate information
      const modificationResult = this.memoParserService.modifySwapMemoWithAffiliate(
        originalMemo,
        affiliateThorname,
        affiliateFeeBp
      );

      if (modificationResult.success) {
        console.log(`✅ [RegistrationService] Successfully modified memo for affiliate injection`);
        console.log(`🔄 [RegistrationService] Changes: ${modificationResult.changes.join(' | ')}`);
        return modificationResult.modifiedMemo;
      } else {
        console.error(`❌ [RegistrationService] Failed to modify memo for affiliate injection:`, modificationResult.errors);
        console.log(`📝 [RegistrationService] Using original memo unchanged`);
        return originalMemo;
      }
    } catch (error) {
      console.error(`💥 [RegistrationService] Error during affiliate injection processing:`, error);
      console.log(`📝 [RegistrationService] Using original memo unchanged due to error`);
      return originalMemo;
    }
  }

  // Calculate both round up and round down amount suggestions
  async calculateAmountSuggestions(request: {
    asset: string;
    reference: string;
    requested_amount: string;
  }): Promise<{
    valid_amount_rounded_up: string;
    valid_amount_rounded_down: string;
    rounded_up_difference_usd: string;
    rounded_down_difference_usd: string;
  }> {
    console.log(`🧮 [RegistrationService] Calculating amount suggestions...`);
    console.log(`🪙 [RegistrationService] Asset: ${request.asset}`);
    console.log(`🔢 [RegistrationService] Reference: "${request.reference}"`);
    console.log(`💰 [RegistrationService] Requested: ${request.requested_amount}`);

    // Step 1: Get asset decimals and price from THORChain pools
    console.log(`📊 [RegistrationService] Fetching asset data from pools...`);
    let decimals = 8; // Default fallback
    let assetPriceUSD = 0; // Default fallback
    try {
      const assets = await this.memolessService.getValidAssetsForRegistration();
      const asset = assets.find((a: any) => a.asset === request.asset);
      if (asset) {
        decimals = asset.decimals || 8;
        assetPriceUSD = asset.priceUSD || 0;
        console.log(`📊 [RegistrationService] Found asset data - Decimals: ${decimals}, Price: $${assetPriceUSD}`);
      } else {
        console.log(`⚠️ [RegistrationService] Asset not found in pools, using defaults`);
      }
    } catch (error) {
      console.warn(`⚠️ [RegistrationService] Failed to fetch asset data, using defaults:`, error);
    }

    const referenceLength = request.reference.length;

    // Step 2: Normalize requested amount to asset decimals (truncate, don't round)
    const [integerPart, decimalPartRaw = ''] = request.requested_amount.split('.');
    const truncatedDecimal = decimalPartRaw.substring(0, decimals).padEnd(decimals, '0');
    const normalizedAmount = `${integerPart}.${truncatedDecimal}`;
    console.log(`📐 [RegistrationService] Normalized requested: ${normalizedAmount}`);

    // Step 3: Generate both round up and round down suggestions
    const roundUpSuggestion = this.calculateSingleSuggestion(normalizedAmount, request.reference, decimals, 'up');
    const roundDownSuggestion = this.calculateSingleSuggestion(normalizedAmount, request.reference, decimals, 'down');

    console.log(`✅ [RegistrationService] Round up suggestion: ${roundUpSuggestion}`);
    console.log(`✅ [RegistrationService] Round down suggestion: ${roundDownSuggestion}`);

    // Step 4: Calculate USD differences
    const requestedFloat = parseFloat(request.requested_amount);
    const roundUpFloat = parseFloat(roundUpSuggestion);
    const roundDownFloat = parseFloat(roundDownSuggestion);

    const roundUpDifferenceAsset = roundUpFloat - requestedFloat;
    const roundDownDifferenceAsset = requestedFloat - roundDownFloat;

    const roundUpDifferenceUSD = roundUpDifferenceAsset * assetPriceUSD;
    const roundDownDifferenceUSD = roundDownDifferenceAsset * assetPriceUSD;

    console.log(`💵 [RegistrationService] USD differences - Up: ${roundUpDifferenceUSD.toFixed(2)}, Down: ${roundDownDifferenceUSD.toFixed(2)}`);

    return {
      valid_amount_rounded_up: roundUpSuggestion,
      valid_amount_rounded_down: roundDownSuggestion,
      rounded_up_difference_usd: roundUpDifferenceUSD.toFixed(2),
      rounded_down_difference_usd: roundDownDifferenceUSD.toFixed(2)
    };
  }

  // Helper method to calculate a single suggestion with rounding direction
  private calculateSingleSuggestion(normalizedAmount: string, reference: string, decimals: number, direction: 'up' | 'down'): string {
    const [integerPart, decimalPart] = normalizedAmount.split('.');
    const referenceLength = reference.length;
    
    // Step 1: Embed reference at the end
    let newDecimalPart = decimalPart.substring(0, decimals - referenceLength) + reference;
    let workingAmount = `${integerPart}.${newDecimalPart}`;
    
    const originalFloat = parseFloat(normalizedAmount);
    let workingFloat = parseFloat(workingAmount);
    
    console.log(`🔧 [RegistrationService] Initial ${direction} candidate: ${workingAmount}`);
    
    if (direction === 'up') {
      // Round up logic: increment until we're higher than requested
      while (workingFloat <= originalFloat) {
        console.log(`⬆️ [RegistrationService] Incrementing: ${workingAmount} <= ${normalizedAmount}`);
        workingAmount = this.incrementBeforeReference(workingAmount, reference, decimals);
        workingFloat = parseFloat(workingAmount);
      }
    } else {
      // Round down logic: decrement until we're lower than or equal to requested
      while (workingFloat > originalFloat) {
        console.log(`⬇️ [RegistrationService] Decrementing: ${workingAmount} > ${normalizedAmount}`);
        workingAmount = this.decrementBeforeReference(workingAmount, referenceLength);
        workingFloat = parseFloat(workingAmount);
      }
    }
    
    console.log(`✅ [RegistrationService] Final ${direction} suggestion: ${workingAmount}`);
    return workingAmount;
  }

  // Helper method to decrement the digit before the reference ID
  private decrementBeforeReference(amount: string, referenceLength: number): string {
    const [integerPart, decimalPart] = amount.split('.');
    const digits = decimalPart.split('');
    const decrementIndex = decimalPart.length - referenceLength - 1;
    
    if (decrementIndex >= 0) {
      let currentDigit = parseInt(digits[decrementIndex]);
      
      if (currentDigit > 0) {
        // Simple decrement
        digits[decrementIndex] = (currentDigit - 1).toString();
      } else {
        // Need to borrow from previous digits
        let borrowIndex = decrementIndex;
        while (borrowIndex >= 0 && digits[borrowIndex] === '0') {
          digits[borrowIndex] = '9';
          borrowIndex--;
        }
        
        if (borrowIndex >= 0) {
          digits[borrowIndex] = (parseInt(digits[borrowIndex]) - 1).toString();
        } else {
          // Need to borrow from integer part
          let intValue = parseInt(integerPart);
          if (intValue > 0) {
            intValue--;
            digits[0] = '9';
            return `${intValue}.${digits.join('')}`;
          } else {
            // Cannot decrement further, return minimum possible
            return `0.${'0'.repeat(decimalPart.length - referenceLength)}${amount.slice(-referenceLength)}`;
          }
        }
      }
    }
    
    return `${integerPart}.${digits.join('')}`;
  }

  /**
   * Get memoless transaction cost from the MemolessService's ThorchainApiService
   * Throws error if unable to fetch the cost
   */
  private async getMemolessTxCostFromMemolessService(): Promise<number> {
    // Access the thorchainApi through memolessService
    const thorchainApi = (this.memolessService as any).thorchainApi;
    if (thorchainApi && typeof thorchainApi.getMemolessTxCost === 'function') {
      return await thorchainApi.getMemolessTxCost();
    } else {
      throw new Error('Could not access getMemolessTxCost method from ThorchainApiService');
    }
  }

  /**
   * Calculate registrations remaining based on RUNE balance and costs
   */
  private calculateRegistrationsRemaining(runeBalance: string, memolessTxCost: number, networkTxFee: number = 0.02): number {
    try {
      const balance = parseFloat(runeBalance);
      const totalCostPerRegistration = memolessTxCost + networkTxFee;
      const remaining = Math.floor(balance / totalCostPerRegistration);
      
      console.log(`🧮 [RegistrationService] Registrations calculation:`);
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
}
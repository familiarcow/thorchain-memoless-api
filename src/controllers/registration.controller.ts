import { Request, Response } from 'express';
import { RegistrationService } from '../services/registration.service';

export interface RegistrationRequest {
  asset: string;
  memo: string;
}

export class RegistrationController {
  private registrationService: RegistrationService;

  constructor(registrationService: RegistrationService) {
    this.registrationService = registrationService;
  }

  // POST /api/v1/register
  async registerMemo(req: Request, res: Response): Promise<void> {
    try {
      const { asset, memo } = req.body;

      // Basic validation
      if (!asset || !memo) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Asset and memo are required parameters'
          }
        });
        return;
      }

      // Validate asset format
      if (!asset.includes('.') || asset.split('.').length !== 2) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ASSET_FORMAT',
            message: 'Asset must be in format CHAIN.SYMBOL (e.g., BTC.BTC, ETH.ETH)'
          }
        });
        return;
      }

      // Validate asset against available assets list
      const availableAssets = await this.registrationService.getValidAssets();
      const isValidAsset = availableAssets.some(availableAsset => availableAsset.asset === asset);
      
      if (!isValidAsset) {
        const supportedAssets = availableAssets.slice(0, 5).map(a => a.asset); // Show top 5
        res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_ASSET',
            message: `Asset '${asset}' is not available for memoless registration`,
            details: {
              providedAsset: asset,
              supportedAssets: supportedAssets,
              totalSupportedAssets: availableAssets.length,
              suggestion: 'Use GET /api/v1/assets to see all available assets'
            }
          }
        });
        return;
      }

      // Basic memo validation (just non-empty)
      if (!memo.trim()) {
        res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_MEMO',
            message: 'Memo cannot be empty'
          }
        });
        return;
      }

      const registrationRequest: RegistrationRequest = {
        asset,
        memo
      };

      const result = await this.registrationService.registerMemo(registrationRequest);
      
      res.status(201).json(result);
    } catch (error) {
      console.error('Error registering memo:', error);
      
      // Handle specific error types
      if ((error as Error).message.includes('already registered')) {
        res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_REGISTRATION',
            message: (error as Error).message
          }
        });
        return;
      }

      if ((error as Error).message.includes('not supported')) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ASSET',
            message: (error as Error).message
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'REGISTRATION_FAILED',
          message: 'Failed to register memo',
          details: (error as Error).message
        }
      });
    }
  }

  // GET /api/v1/register/{registrationId}
  async getRegistrationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { registrationId } = req.params;
      const registration = await this.registrationService.getRegistrationStatus(registrationId);

      if (!registration) {
        res.status(404).json({
          success: false,
          error: {
            code: 'REGISTRATION_NOT_FOUND',
            message: `Registration ${registrationId} not found`
          }
        });
        return;
      }

      // Format response with essential fields only
      const response: any = {
        registrationId: registration.id,
        status: registration.status,
        txHash: registration.txHash,
        asset: registration.asset,
        memo: registration.memo,
        createdAt: registration.createdAt,
      };

      // Add confirmed data if available
      if (registration.status === 'confirmed' && registration.referenceId) {
        response.referenceId = registration.referenceId;
        
        if (registration.inboundAddress) {
          response.depositInfo = {
            inboundAddress: registration.inboundAddress,
            dustThreshold: registration.dustThreshold ? registration.dustThreshold / 1e8 : 0,
            chain: registration.chain,
            expiresAt: registration.expiresAt,
            maxUse: registration.maxUse,
            usageCount: registration.usageCount,
            available: registration.status === 'confirmed'
          };
        }
      }

      res.json({
        success: true,
        registration: response
      });
    } catch (error) {
      console.error('Error fetching registration status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_REGISTRATION_FAILED',
          message: 'Failed to fetch registration status',
          details: (error as Error).message
        }
      });
    }
  }

  // POST /api/v1/preflight
  async preflightCheck(req: Request, res: Response): Promise<void> {
    try {
      const { internal_api_id, asset, reference, amount, inputType = 'asset' } = req.body;

      // Validate required parameters
      if (!amount) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_AMOUNT',
            message: 'Amount is required'
          }
        });
        return;
      }

      // Must provide either internal_api_id OR (asset + reference)
      if (!internal_api_id && (!asset || !reference)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Either internal_api_id OR both asset and reference are required'
          }
        });
        return;
      }

      // If both internal_api_id and asset+reference provided, use asset flow
      // Remove the conflicting parameters error

      const validation = await this.registrationService.preflightCheck({
        internal_api_id,
        asset,
        reference,
        amount,
        inputType: 'asset' // Only asset type supported
      });

      // Return success/failure based on validation result with essential information
      if (validation.isValid) {
        res.json({
          success: true,
          message: 'Preflight check passed - proceed with transaction',
          data: {
            current_uses: validation.usage.current_uses,
            max_uses: validation.usage.max_uses,
            memo: validation.memo,
            inbound_address: validation.deposit?.inbound_address,
            qr_code: validation.deposit?.qr_code?.qrString,
            qr_code_data_url: validation.deposit?.qr_code?.qrCodeDataURL,
            time_remaining: validation.validationDetails.timeRemaining,
            blocks_remaining: validation.validationDetails.blocksRemaining,
            seconds_remaining: validation.validationDetails.blocksRemaining * 6
          }
        });
      } else {
        // Generate appropriate error message based on specific failure type
        let errorMessage = 'Preflight check failed';
        
        if (validation.errors && validation.errors.length > 0) {
          // Use THORChain validation errors (reference not registered, max usage reached, etc.)
          errorMessage = validation.errors[0];
        } else if (!validation.validationDetails?.referenceMatches) {
          // Reference ID mismatch error
          const referenceId = validation.validationDetails?.referenceId || 'reference';
          errorMessage = `Amount validation failed. The last ${referenceId.length} digits of the decimal places must be ${referenceId}`;
        } else if (!validation.validationDetails?.aboveDustThreshold) {
          errorMessage = 'Amount is below dust threshold';
        }
        
        res.status(400).json({
          success: false,
          error: {
            code: 'PREFLIGHT_FAILED',
            message: errorMessage
          },
          data: {
            current_uses: validation.usage?.current_uses || 0,
            max_uses: validation.usage?.max_uses || 3,
            time_remaining: validation.validationDetails?.timeRemaining,
            blocks_remaining: validation.validationDetails?.blocksRemaining,
            seconds_remaining: (validation.validationDetails?.blocksRemaining || 0) * 6
          }
        });
      }
    } catch (error) {
      console.error('Error in preflight check:', error);
      
      if ((error as Error).message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: {
            code: 'REGISTRATION_NOT_FOUND',
            message: (error as Error).message
          }
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'PREFLIGHT_FAILED',
          message: 'Failed to perform preflight check',
          details: (error as Error).message
        }
      });
    }
  }



  // POST /api/v1/track-transaction  
  async trackTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { txHash } = req.body;

      if (!txHash) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_TX_HASH',
            message: 'Transaction hash is required'
          }
        });
        return;
      }

      // Clean tx hash (remove 0x prefix if present)
      let cleanHash = txHash;
      if (txHash.startsWith('0x')) {
        cleanHash = txHash.substring(2);
      }

      // Basic validation
      const isValid = cleanHash.length >= 32 && /^[a-fA-F0-9]+$/.test(cleanHash);
      if (!isValid) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TX_HASH',
            message: 'Transaction hash must be a valid hexadecimal string (minimum 32 characters)'
          }
        });
        return;
      }

      // Generate tracking URL
      const network = process.env.THORCHAIN_NETWORK || 'stagenet';
      const baseUrl = network === 'mainnet' 
        ? 'https://thorchain.net/tx/' 
        : 'https://stagenet.thorchain.net/tx/';

      res.json({
        success: true,
        tracking: {
          isValid: true,
          cleanTxHash: cleanHash,
          trackingUrl: `${baseUrl}${cleanHash}`,
          network
        }
      });
    } catch (error) {
      console.error('Error tracking transaction:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRACKING_FAILED',
          message: 'Failed to process transaction tracking',
          details: (error as Error).message
        }
      });
    }
  }
}
import { Request, Response } from 'express';
import { RegistrationService } from '../services/registration.service';

export class AssetsController {
  private registrationService: RegistrationService;

  constructor(registrationService: RegistrationService) {
    this.registrationService = registrationService;
  }

  // GET /api/v1/assets
  async getAssets(req: Request, res: Response): Promise<void> {
    try {
      const assets = await this.registrationService.getValidAssets();
      
      res.json({
        success: true,
        assets: assets.map(asset => ({
          asset: asset.asset,
          decimals: asset.decimals,
          priceUSD: asset.priceUSD,
          balanceRune: asset.balanceRune.toString(),
          status: asset.status,
          isToken: asset.isToken
        }))
      });
    } catch (error) {
      console.error('Error fetching assets:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_ASSETS_FAILED',
          message: 'Failed to fetch valid assets',
          details: (error as Error).message
        }
      });
    }
  }

  // GET /api/v1/assets/{asset}
  async getAssetDetails(req: Request, res: Response): Promise<void> {
    try {
      const { asset } = req.params;
      const assets = await this.registrationService.getValidAssets();
      const assetInfo = assets.find(a => a.asset === asset);

      if (!assetInfo) {
        res.status(404).json({
          success: false,
          error: {
            code: 'ASSET_NOT_FOUND',
            message: `Asset ${asset} not found or not supported`,
            supportedAssets: assets.map(a => a.asset)
          }
        });
        return;
      }

      res.json({
        success: true,
        asset: {
          asset: assetInfo.asset,
          decimals: assetInfo.decimals,
          priceUSD: assetInfo.priceUSD,
          balanceRune: assetInfo.balanceRune.toString(),
          status: assetInfo.status,
          isToken: assetInfo.isToken,
          chain: assetInfo.asset.split('.')[0]
        }
      });
    } catch (error) {
      console.error('Error fetching asset details:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_ASSET_FAILED',
          message: 'Failed to fetch asset details',
          details: (error as Error).message
        }
      });
    }
  }
}
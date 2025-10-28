import { NetworkConfig } from '../types';

export function getNetworkConfig(): NetworkConfig {
  const network = (process.env.THORCHAIN_NETWORK as 'mainnet' | 'stagenet') || 'stagenet';
  
  if (network === 'mainnet') {
    return {
      network: 'mainnet',
      addressPrefix: 'thor',
      rpcUrl: process.env.THORCHAIN_RPC || 'https://rpc.ninerealms.com',
      apiUrl: process.env.THORNODE_API || 'https://thornode.ninerealms.com',
      chainId: 'thorchain-mainnet-v1',
      thorchainModuleAddress: 'thor1v8ppstuf6e3x0r4glqc68d5jqcs2tf38cg2q6y'
    };
  } else {
    return {
      network: 'stagenet',
      addressPrefix: 'sthor',
      rpcUrl: process.env.THORCHAIN_RPC || 'https://stagenet-rpc.ninerealms.com:443',
      apiUrl: process.env.THORNODE_API || 'https://stagenet-thornode.ninerealms.com',
      chainId: 'thorchain-stagenet-v2',
      thorchainModuleAddress: 'sthor1v8ppstuf6e3x0r4glqc68d5jqcs2tf38v3kkv6'
    };
  }
}

export function validateEnvironmentVariables(): void {
  const required = [
    'HOT_WALLET_MNEMONIC'
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('✅ Environment variables validated');
  console.log(`🌐 Network: ${process.env.THORCHAIN_NETWORK || 'stagenet'}`);
  
  if (!process.env.DATABASE_URL) {
    console.log('⚠️  DATABASE_URL not provided - running without persistent storage');
  }
}
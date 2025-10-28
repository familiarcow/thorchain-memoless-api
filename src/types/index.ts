// Core types extracted from legacy services
export interface Pool {
  asset: string;
  short_code?: string;
  status: string;
  decimal?: number;
  decimals?: number;
  balance_asset: number;
  balance_rune: number;
  asset_tor_price?: string;
  asset_price_usd?: number;
  pending_inbound_asset?: number;
  pending_inbound_rune?: number;
  pool_units?: number;
  LP_units?: number;
  synth_units?: number;
  synth_supply?: number;
  savers_depth?: number;
  savers_units?: number;
  synth_mint_paused?: boolean;
  synth_supply_remaining?: number;
  loan_collateral?: number;
  loan_collateral_remaining?: number;
  loan_cr?: number;
  derived_depth_bps?: number;
  trading_halted?: boolean;
}

export interface MemolessAsset {
  asset: string;
  status: string;
  decimals: number;
  priceUSD: number;
  balanceRune: number;
  isToken: boolean;
}

export interface InboundAddress {
  chain: string;
  pub_key: string;
  address: string;
  router?: string;
  halted: boolean;
  global_trading_paused: boolean;
  chain_trading_paused: boolean;
  chain_lp_actions_paused: boolean;
  observed_fee_rate: string;
  gas_rate: string;
  gas_rate_units: string;
  outbound_tx_size: string;
  outbound_fee: string;
  dust_threshold: string;
}

export interface MemoReference {
  asset: string;
  memo: string;
  reference: string;
  height: string;
  registration_hash: string;
  registered_by: string;
}

export interface MemoCheckResponse {
  reference: string;
  available: boolean;
  expires_at: string;
  usage_count: string;
  max_use: string;
  can_register: boolean;
  memo: string;
}

export interface BlockInfo {
  chain: string;
  last_observed_in: number;
  last_signed_out: number;
  thorchain: number;
}

export interface Balance {
  asset: string;
  amount: string;
}

export interface WalletInfo {
  address: string;
  mainnetAddress: string;
  stagenetAddress: string;
  publicKey: string;
  mnemonic: string;
}

export interface TransactionParams {
  asset: string;
  amount: string;
  memo?: string;
  toAddress?: string;
  useMsgDeposit?: boolean;
}

export interface TransactionResponse {
  code: number;
  transactionHash: string;
  rawLog: string;
  events?: any[];
}

export interface AmountValidationResult {
  isValid: boolean;
  processedInput: string;
  finalAmount: string;
  equivalentUSD: string;
  warnings: string[];
  errors: string[];
}

export interface QRCodeData {
  chain: string;
  address: string;
  amount: string;
  qrString: string;
  qrCodeDataURL?: string;
}

export interface NetworkConfig {
  network: 'mainnet' | 'stagenet';
  addressPrefix: string;
  rpcUrl: string;
  apiUrl: string;
  chainId: string;
  thorchainModuleAddress: string;
}



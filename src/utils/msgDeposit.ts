import { Registry } from '@cosmjs/proto-signing';

export interface Asset {
  chain: string;
  symbol: string;
  ticker: string;
  synth: boolean;
  trade: boolean;
}

export interface Coin {
  asset: Asset;
  amount: string;
  decimals: number;
}

export interface MsgDepositValue {
  coins: Coin[];
  memo: string;
  signer: string;
}

export const MSG_DEPOSIT_TYPE_URL = '/types.MsgDeposit';

export const MsgDeposit = {
  create(base?: Partial<MsgDepositValue>): MsgDepositValue {
    return {
      coins: base?.coins || [],
      memo: base?.memo || '',
      signer: base?.signer || ''
    };
  },

  encode(message: MsgDepositValue, writer?: any): any {
    const Writer = require('protobufjs').Writer;
    const w = writer || Writer.create();
    
    for (const coin of message.coins) {
      w.uint32(10).fork();
      
      w.uint32(10).fork();
      w.uint32(10).string(coin.asset.chain);
      w.uint32(18).string(coin.asset.symbol);
      w.uint32(26).string(coin.asset.ticker);
      w.uint32(32).bool(coin.asset.synth);
      w.uint32(40).bool(coin.asset.trade);
      w.ldelim();
      
      w.uint32(18).string(coin.amount);
      w.uint32(24).int64(coin.decimals);
      
      w.ldelim();
    }
    
    if (message.memo) {
      w.uint32(18).string(message.memo);
    }
    
    if (message.signer) {
      const { fromBech32 } = require('@cosmjs/encoding');
      try {
        const { data } = fromBech32(message.signer);
        w.uint32(26).bytes(data);
      } catch (error) {
        w.uint32(26).bytes(Buffer.from(message.signer, 'utf8'));
      }
    }
    
    return w;
  },

  decode(input: any, length?: number): MsgDepositValue {
    const reader = input instanceof Uint8Array ? new (require('protobufjs').Reader)(input) : input;
    const end = length === undefined ? reader.len : reader.pos + length;
    const message: MsgDepositValue = { coins: [], memo: '', signer: '' };
    
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          const coin = { 
            asset: { chain: '', symbol: '', ticker: '', synth: false, trade: false }, 
            amount: '', 
            decimals: 0 
          };
          const coinEnd = reader.uint32() + reader.pos;
          while (reader.pos < coinEnd) {
            const coinTag = reader.uint32();
            switch (coinTag >>> 3) {
              case 1:
                const assetEnd = reader.uint32() + reader.pos;
                while (reader.pos < assetEnd) {
                  const assetTag = reader.uint32();
                  switch (assetTag >>> 3) {
                    case 1: coin.asset.chain = reader.string(); break;
                    case 2: coin.asset.symbol = reader.string(); break;
                    case 3: coin.asset.ticker = reader.string(); break;
                    case 4: coin.asset.synth = reader.bool(); break;
                    case 5: coin.asset.trade = reader.bool(); break;
                    default: reader.skipType(assetTag & 7); break;
                  }
                }
                break;
              case 2: coin.amount = reader.string(); break;
              case 3: coin.decimals = reader.int64(); break;
              default: reader.skipType(coinTag & 7); break;
            }
          }
          message.coins.push(coin);
          break;
        case 2: message.memo = reader.string(); break;
        case 3: message.signer = reader.string(); break;
        default: reader.skipType(tag & 7); break;
      }
    }
    return message;
  },

  fromJSON(object: any): MsgDepositValue {
    return {
      coins: object.coins || [],
      memo: object.memo || '',
      signer: object.signer || ''
    };
  },

  toJSON(message: MsgDepositValue): any {
    return {
      coins: message.coins,
      memo: message.memo,
      signer: message.signer
    };
  }
};

export function registerMsgDeposit(registry: Registry): void {
  registry.register(MSG_DEPOSIT_TYPE_URL, MsgDeposit);
}

export function createMsgDeposit(params: {
  coins: Array<{ denom: string; amount: string }>;
  memo: string;
  signer: string;
}): { typeUrl: string; value: MsgDepositValue } {
  const thorchainCoins: Coin[] = params.coins.map(coin => {
    let chain = 'THOR';
    let symbol = 'RUNE';
    let ticker = 'RUNE';
    let decimals = 8;
    
    if (coin.denom === 'rune') {
      // THOR.RUNE - explicit handling
      chain = 'THOR';
      symbol = 'RUNE';
      ticker = 'RUNE';
      decimals = 8;
    } else if (!coin.denom.includes('/') && !coin.denom.includes('-')) {
      // THOR native assets - denom is a single word (tcy, ruji, etc.)
      // These are THORChain native assets without slashes or hyphens
      chain = 'THOR';
      symbol = coin.denom.toUpperCase();  // tcy -> TCY, ruji -> RUJI
      ticker = symbol;
      decimals = 8;
    } else {
      const parts = coin.denom.split('-');
      if (parts.length === 2) {
        chain = parts[0].toUpperCase();
        symbol = parts[1].toUpperCase();
        ticker = parts[1].toUpperCase();
        decimals = 8;
      }
    }
    
    return {
      asset: {
        chain,
        symbol,
        ticker,
        synth: false,
        trade: false
      },
      amount: coin.amount,
      decimals: decimals
    };
  });

  return {
    typeUrl: MSG_DEPOSIT_TYPE_URL,
    value: {
      coins: thorchainCoins,
      memo: params.memo,
      signer: params.signer
    }
  };
}
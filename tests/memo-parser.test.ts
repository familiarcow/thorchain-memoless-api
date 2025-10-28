import { MemoParserService } from '../src/services/memo-parser.service';

describe('MemoParserService', () => {
  let memoParser: MemoParserService;

  beforeEach(() => {
    memoParser = new MemoParserService();
  });

  describe('isSwapMemo', () => {
    it('should detect swap memo with = symbol', () => {
      expect(memoParser.isSwapMemo('=:BTC.BTC:bc1quser123:1000')).toBe(true);
    });

    it('should detect swap memo with s symbol', () => {
      expect(memoParser.isSwapMemo('s:BTC.BTC:bc1quser123:1000')).toBe(true);
    });

    it('should detect swap memo with SWAP keyword', () => {
      expect(memoParser.isSwapMemo('SWAP:BTC.BTC:bc1quser123:1000')).toBe(true);
    });

    it('should detect swap memo with lowercase swap keyword', () => {
      expect(memoParser.isSwapMemo('swap:BTC.BTC:bc1quser123:1000')).toBe(true);
    });

    it('should not detect add liquidity as swap', () => {
      expect(memoParser.isSwapMemo('+:BTC.BTC:bc1quser123')).toBe(false);
    });

    it('should not detect withdraw as swap', () => {
      expect(memoParser.isSwapMemo('-:BTC.BTC:5000:bc1quser123')).toBe(false);
    });

    it('should not detect donate as swap', () => {
      expect(memoParser.isSwapMemo('DONATE:BTC.BTC')).toBe(false);
    });

    it('should handle empty memo', () => {
      expect(memoParser.isSwapMemo('')).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(memoParser.isSwapMemo('  =:BTC.BTC:bc1quser123:1000  ')).toBe(true);
    });
  });

  describe('parseMemo', () => {
    it('should parse a basic swap memo', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('swap');
      expect(parsed.action).toBe('=');
      expect(parsed.targetAsset).toBe('BTC.BTC');
      expect(parsed.targetAddress).toBe('bc1quser123');
      expect(parsed.limit).toBe('1000');
      expect(parsed.affiliate).toBe('');
      expect(parsed.fee).toBe('');
    });

    it('should parse a swap memo with affiliate info', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000:thor1affiliate:50';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('swap');
      expect(parsed.action).toBe('=');
      expect(parsed.targetAsset).toBe('BTC.BTC');
      expect(parsed.targetAddress).toBe('bc1quser123');
      expect(parsed.limit).toBe('1000');
      expect(parsed.affiliate).toBe('thor1affiliate');
      expect(parsed.fee).toBe('50');
    });

    it('should parse a swap memo with s: format', () => {
      const memo = 's:BTC.BTC:bc1quser123:1000';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('swap');
      expect(parsed.action).toBe('s');
      expect(parsed.targetAsset).toBe('BTC.BTC');
      expect(parsed.targetAddress).toBe('bc1quser123');
      expect(parsed.limit).toBe('1000');
      expect(parsed.affiliate).toBe('');
      expect(parsed.fee).toBe('');
    });

    it('should parse a swap memo with SWAP: format', () => {
      const memo = 'SWAP:BTC.BTC:bc1quser123:1000';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('swap');
      expect(parsed.action).toBe('SWAP');
      expect(parsed.targetAsset).toBe('BTC.BTC');
      expect(parsed.targetAddress).toBe('bc1quser123');
      expect(parsed.limit).toBe('1000');
      expect(parsed.affiliate).toBe('');
      expect(parsed.fee).toBe('');
    });

    it('should parse an add liquidity memo', () => {
      const memo = '+:BTC.BTC:bc1quser123';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('add');
      expect(parsed.action).toBe('+');
      expect(parsed.targetAsset).toBe('BTC.BTC');
      expect(parsed.targetAddress).toBe('bc1quser123');
      expect(parsed.affiliate).toBe('');
      expect(parsed.fee).toBe('');
    });

    it('should parse a withdraw memo', () => {
      const memo = '-:BTC.BTC:5000:bc1quser123';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('withdraw');
      expect(parsed.action).toBe('-');
      expect(parsed.targetAsset).toBe('BTC.BTC');
      expect(parsed.limit).toBe('5000'); // basis points
      expect(parsed.targetAddress).toBe('bc1quser123');
    });

    it('should parse a donate memo', () => {
      const memo = 'DONATE:BTC.BTC';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('donate');
      expect(parsed.action).toBe('DONATE');
      expect(parsed.remainingParts).toEqual(['BTC.BTC']);
    });

    it('should handle unknown memo types', () => {
      const memo = 'UNKNOWN:ACTION:TEST';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('unknown');
      expect(parsed.action).toBe('UNKNOWN');
      expect(parsed.remainingParts).toEqual(['ACTION', 'TEST']);
    });

    it('should handle empty memo', () => {
      const memo = '';
      const parsed = memoParser.parseMemo(memo);

      expect(parsed.type).toBe('unknown');
      expect(parsed.action).toBe('');
    });
  });

  describe('modifySwapMemoWithAffiliate', () => {
    it('should inject affiliate into basic swap memo', () => {
      const memo = '=:BTC.BTC:bc1quser123';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123::-:5');
      expect(result.changes).toContain('Added affiliate: -');
      expect(result.changes).toContain('Added affiliate fee: 5 BP');
    });

    it('should inject affiliate into swap with limit', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123:1000:-:5');
      expect(result.changes).toContain('Added affiliate: -');
      expect(result.changes).toContain('Added affiliate fee: 5 BP');
    });

    it('should inject affiliate into swap with empty limit', () => {
      const memo = '=:BTC.BTC:bc1quser123:';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123::-:5');
      expect(result.changes).toContain('Added affiliate: -');
      expect(result.changes).toContain('Added affiliate fee: 5 BP');
    });

    it('should append to existing single affiliate', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000:tom:10';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123:1000:tom/-:10/5');
      expect(result.changes).toContain('Appended affiliate: tom → tom/-');
      expect(result.changes).toContain('Appended affiliate fee: 10 → 10/5 BP');
    });

    it('should append to existing multiple affiliates', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000:tom/jerry:5/21';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123:1000:tom/jerry/-:5/21/5');
      expect(result.changes).toContain('Appended affiliate: tom/jerry → tom/jerry/-');
      expect(result.changes).toContain('Appended affiliate fee: 5/21 → 5/21/5 BP');
    });

    it('should handle existing affiliate with empty limit', () => {
      const memo = '=:BTC.BTC:bc1quser123::tom:10';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123::tom/-:10/5');
      expect(result.changes).toContain('Appended affiliate: tom → tom/-');
      expect(result.changes).toContain('Appended affiliate fee: 10 → 10/5 BP');
    });

    it('should work with different swap formats', () => {
      const memoS = 's:BTC.BTC:bc1quser123:1000';
      const memoSwap = 'SWAP:BTC.BTC:bc1quser123:1000';

      const resultS = memoParser.modifySwapMemoWithAffiliate(memoS, '-', '5');
      const resultSwap = memoParser.modifySwapMemoWithAffiliate(memoSwap, '-', '5');

      expect(resultS.success).toBe(true);
      expect(resultS.modifiedMemo).toBe('s:BTC.BTC:bc1quser123:1000:-:5');

      expect(resultSwap.success).toBe(true);
      expect(resultSwap.modifiedMemo).toBe('SWAP:BTC.BTC:bc1quser123:1000:-:5');
    });

    it('should reject non-swap memos', () => {
      const memo = '+:BTC.BTC:bc1quser123';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Not a valid swap memo format');
    });

    it('should validate affiliate address', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '', '5');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Affiliate address cannot be empty');
    });

    it('should validate fee range', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '10001');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid affiliate fee: 10001. Must be 0-10000 basis points');
    });

    it('should handle malformed memos', () => {
      const memo = '=:BTC.BTC';
      const result = memoParser.modifySwapMemoWithAffiliate(memo, '-', '5');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid swap memo: missing required fields');
    });
  });

  describe('modifyMemoWithAffiliate', () => {
    it('should add affiliate info to a basic swap memo (via enhanced method)', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const affiliateAddr = 'thor1affiliate123456789abcdef123456789abcdef12';
      const affiliateFee = '100';

      const result = memoParser.modifyMemoWithAffiliate(memo, affiliateAddr, affiliateFee);

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123:1000:thor1affiliate123456789abcdef123456789abcdef12:100');
      expect(result.changes).toContain('Added affiliate: thor1affiliate123456789abcdef123456789abcdef12');
      expect(result.changes).toContain('Added affiliate fee: 100 BP');
    });

    it('should append to existing affiliate in swap memo (via enhanced method)', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000:thor1oldaffiliate:50';
      const affiliateAddr = 'thor1newaffiliate123456789abcdef123456789abcdef';
      const affiliateFee = '100';

      const result = memoParser.modifyMemoWithAffiliate(memo, affiliateAddr, affiliateFee);

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('=:BTC.BTC:bc1quser123:1000:thor1oldaffiliate/thor1newaffiliate123456789abcdef123456789abcdef:50/100');
      expect(result.changes).toContain('Appended affiliate: thor1oldaffiliate → thor1oldaffiliate/thor1newaffiliate123456789abcdef123456789abcdef');
      expect(result.changes).toContain('Appended affiliate fee: 50 → 50/100 BP');
    });

    it('should add affiliate info to add liquidity memo', () => {
      const memo = '+:BTC.BTC:bc1quser123';
      const affiliateAddr = 'thor1affiliate123456789abcdef123456789abcdef12';
      const affiliateFee = '75';

      const result = memoParser.modifyMemoWithAffiliate(memo, affiliateAddr, affiliateFee);

      expect(result.success).toBe(true);
      expect(result.modifiedMemo).toBe('+:BTC.BTC:bc1quser123:thor1affiliate123456789abcdef123456789abcdef12:75');
      expect(result.changes).toContain('Added affiliate address: thor1affiliate123456789abcdef123456789abcdef12');
      expect(result.changes).toContain('Added affiliate fee: 75 BP');
    });

    it('should reject unsupported memo types', () => {
      const memo = 'DONATE:BTC.BTC';
      const affiliateAddr = 'thor1affiliate123456789abcdef123456789abcdef12';

      const result = memoParser.modifyMemoWithAffiliate(memo, affiliateAddr);

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Memo type 'donate' does not support affiliate fees");
    });

    it('should validate affiliate address format for swap memos', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const invalidAddr = '';

      const result = memoParser.modifyMemoWithAffiliate(memo, invalidAddr);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Affiliate address cannot be empty');
    });

    it('should validate affiliate fee range', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      const affiliateAddr = 'thor1affiliate123456789abcdef123456789abcdef12';

      const result = memoParser.modifyMemoWithAffiliate(memo, affiliateAddr, '10001');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Invalid affiliate fee: 10001. Must be 0-10000 basis points');
    });
  });

  describe('extractUserInput', () => {
    it('should extract user input from swap memo with affiliate', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000:thor1affiliate:50';
      const userInput = memoParser.extractUserInput(memo);

      expect(userInput).toBe('=:BTC.BTC:bc1quser123:1000');
    });

    it('should extract user input from add memo with affiliate', () => {
      const memo = '+:BTC.BTC:bc1quser123:thor1affiliate:50';
      const userInput = memoParser.extractUserInput(memo);

      expect(userInput).toBe('+:BTC.BTC:bc1quser123');
    });

    it('should return original memo for unsupported types', () => {
      const memo = 'DONATE:BTC.BTC';
      const userInput = memoParser.extractUserInput(memo);

      expect(userInput).toBe('DONATE:BTC.BTC');
    });
  });

  describe('hasAffiliateInfo', () => {
    it('should detect affiliate info in swap memo', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000:thor1affiliate:50';
      expect(memoParser.hasAffiliateInfo(memo)).toBe(true);
    });

    it('should detect no affiliate info in basic swap memo', () => {
      const memo = '=:BTC.BTC:bc1quser123:1000';
      expect(memoParser.hasAffiliateInfo(memo)).toBe(false);
    });
  });

  describe('replaceUserInput', () => {
    it('should replace user input while preserving affiliate info', () => {
      const originalMemo = '=:BTC.BTC:bc1quser123:1000:thor1affiliate:50';
      const newUserInput = '=:ETH.ETH:0x742d35Cc:2000';

      const result = memoParser.replaceUserInput(originalMemo, newUserInput);

      expect(result).toBe('=:ETH.ETH:0x742d35Cc:2000:thor1affiliate:50');
    });

    it('should handle mismatched memo types', () => {
      const originalMemo = '=:BTC.BTC:bc1quser123:1000:thor1affiliate:50';
      const newUserInput = 'DONATE:BTC.BTC';

      const result = memoParser.replaceUserInput(originalMemo, newUserInput);

      expect(result).toBe('DONATE:BTC.BTC');
    });
  });
});
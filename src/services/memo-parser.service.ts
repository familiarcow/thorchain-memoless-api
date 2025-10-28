/**
 * Memo Parser Service
 * 
 * Handles parsing and modification of THORChain memos to support affiliate fees.
 * Supports various memo formats including swap, add liquidity, withdraw, etc.
 */

export interface ParsedMemo {
  type: 'swap' | 'add' | 'withdraw' | 'donate' | 'bond' | 'unbond' | 'leave' | 'reserve' | 'refund' | 'noop' | 'unknown';
  originalMemo: string;
  action: string; // First part (=:, +:, -:, etc.)
  targetAsset?: string; // Second part for swaps/adds
  targetAddress?: string; // Third part - destination address
  limit?: string; // Fourth part - limit/slip
  affiliate?: string; // Fifth part - affiliate address
  fee?: string; // Sixth part - affiliate fee in basis points
  remainingParts?: string[]; // Any additional parts
}

export interface MemoModificationResult {
  success: boolean;
  originalMemo: string;
  modifiedMemo: string;
  changes: string[];
  errors?: string[];
}

export class MemoParserService {
  
  /**
   * Parse a THORChain memo into its component parts
   */
  parseMemo(memo: string): ParsedMemo {
    console.log('🔍 [MemoParser] Parsing memo:', memo);
    
    const trimmed = memo.trim();
    if (!trimmed) {
      return {
        type: 'unknown',
        originalMemo: memo,
        action: ''
      };
    }

    // Split by colon to get memo parts
    const parts = trimmed.split(':');
    const action = parts[0] || '';
    
    console.log('📋 [MemoParser] Memo parts:', parts);
    console.log('🎬 [MemoParser] Action:', action);

    // Determine memo type based on action
    const type = this.determineMemoType(action);
    console.log('🏷️ [MemoParser] Memo type:', type);

    const parsed: ParsedMemo = {
      type,
      originalMemo: memo,
      action
    };

    // Parse specific parts based on memo type
    if (type === 'swap') {
      // Swap format: =:ASSET:DEST_ADDR:LIM/STREAMING_INTERVAL/STREAMING_QUANTITY:AFFILIATE_ADDR:AFFILIATE_FEE_BP
      parsed.targetAsset = parts[1] || '';
      parsed.targetAddress = parts[2] || '';
      parsed.limit = parts[3] || '';
      parsed.affiliate = parts[4] || '';
      parsed.fee = parts[5] || '';
      parsed.remainingParts = parts.slice(6);
    } else if (type === 'add') {
      // Add liquidity format: +:ASSET:DEST_ADDR:AFFILIATE_ADDR:AFFILIATE_FEE_BP
      parsed.targetAsset = parts[1] || '';
      parsed.targetAddress = parts[2] || '';
      parsed.affiliate = parts[3] || '';
      parsed.fee = parts[4] || '';
      parsed.remainingParts = parts.slice(5);
    } else if (type === 'withdraw') {
      // Withdraw format: -:ASSET:BASIS_POINTS:ASSET_ADDR
      parsed.targetAsset = parts[1] || '';
      parsed.limit = parts[2] || ''; // basis points for withdrawal
      parsed.targetAddress = parts[3] || '';
      parsed.remainingParts = parts.slice(4);
    } else {
      // For other memo types, just store remaining parts
      parsed.remainingParts = parts.slice(1);
    }

    console.log('✅ [MemoParser] Parsed memo structure:', {
      type: parsed.type,
      targetAsset: parsed.targetAsset,
      hasAffiliate: !!parsed.affiliate,
      hasFee: !!parsed.fee
    });

    return parsed;
  }

  /**
   * Check if a memo represents a swap transaction
   * Swaps can start with: "=:", "s:", or "SWAP:"
   */
  isSwapMemo(memo: string): boolean {
    const trimmed = memo.trim();
    if (!trimmed) return false;
    
    const action = trimmed.split(':')[0] || '';
    const actionLower = action.toLowerCase();
    
    // Check for swap patterns: =, s, or SWAP
    return action === '=' || action.toLowerCase() === 's' || actionLower === 'swap';
  }

  /**
   * Determine memo type based on the action prefix
   */
  private determineMemoType(action: string): ParsedMemo['type'] {
    const actionLower = action.toLowerCase();
    
    // Classic symbols and swap patterns
    if (action === '=' || action.toLowerCase() === 's' || actionLower === 'swap') {
      return 'swap';
    }
    if (action === '+' || actionLower.startsWith('add')) {
      return 'add';
    }
    if (action === '-' || actionLower.startsWith('withdraw')) {
      return 'withdraw';
    }
    
    // Named actions
    if (actionLower.startsWith('donate')) {
      return 'donate';
    }
    if (actionLower.startsWith('bond')) {
      return 'bond';
    }
    if (actionLower.startsWith('unbond')) {
      return 'unbond';
    }
    if (actionLower.startsWith('leave')) {
      return 'leave';
    }
    if (actionLower.startsWith('reserve')) {
      return 'reserve';
    }
    if (actionLower.startsWith('refund')) {
      return 'refund';
    }
    if (actionLower.startsWith('noop')) {
      return 'noop';
    }
    
    return 'unknown';
  }

  /**
   * Modify a swap memo by inserting or updating affiliate information
   * Handles proper field positioning and multiple affiliate chaining
   */
  modifySwapMemoWithAffiliate(
    memo: string, 
    affiliateAddress: string, 
    affiliateFeeBp: string = '5'
  ): MemoModificationResult {
    console.log('🔧 [MemoParser] Modifying swap memo with affiliate...');
    console.log('📝 [MemoParser] Original memo:', memo);
    console.log('🤝 [MemoParser] Affiliate address:', affiliateAddress);
    console.log('💰 [MemoParser] Affiliate fee BP:', affiliateFeeBp);

    const changes: string[] = [];
    const errors: string[] = [];

    // Validate it's a swap memo
    if (!this.isSwapMemo(memo)) {
      return {
        success: false,
        originalMemo: memo,
        modifiedMemo: memo,
        changes: [],
        errors: ['Not a valid swap memo format']
      };
    }

    // Validate affiliate address
    if (!affiliateAddress || affiliateAddress.trim().length === 0) {
      errors.push('Affiliate address cannot be empty');
    }

    // Validate fee basis points (should be 0-10000)
    const feeNumber = parseInt(affiliateFeeBp);
    if (isNaN(feeNumber) || feeNumber < 0 || feeNumber > 10000) {
      errors.push(`Invalid affiliate fee: ${affiliateFeeBp}. Must be 0-10000 basis points`);
    }

    if (errors.length > 0) {
      return {
        success: false,
        originalMemo: memo,
        modifiedMemo: memo,
        changes: [],
        errors
      };
    }

    // Split memo by colons to get fields
    const fields = memo.trim().split(':');
    console.log('📋 [MemoParser] Memo fields:', fields);

    // Validate minimum required fields
    if (fields.length < 3) {
      return {
        success: false,
        originalMemo: memo,
        modifiedMemo: memo,
        changes: [],
        errors: ['Invalid swap memo: missing required fields']
      };
    }

    // Build modified memo using field-based logic
    const modifiedMemo = this.buildSwapMemoWithAffiliate(fields, affiliateAddress, affiliateFeeBp, changes);

    console.log('✅ [MemoParser] Modification complete');
    console.log('📝 [MemoParser] Modified memo:', modifiedMemo);
    console.log('🔄 [MemoParser] Changes made:', changes);

    return {
      success: true,
      originalMemo: memo,
      modifiedMemo,
      changes
    };
  }

  /**
   * Build swap memo with affiliate using proper field positioning
   * Format: ACTION:ASSET:DESTADDR:LIMIT:AFFILIATE:FEE
   */
  private buildSwapMemoWithAffiliate(
    fields: string[],
    affiliateAddress: string,
    affiliateFeeBp: string,
    changes: string[]
  ): string {
    const result = [...fields]; // Copy original fields

    // We already validated this in the calling function, but double-check
    if (result.length < 3) {
      throw new Error('Invalid swap memo: missing required fields');
    }

    // Pad fields to ensure proper structure: [ACTION, ASSET, DESTADDR, LIMIT, AFFILIATE, FEE]
    while (result.length < 6) {
      if (result.length === 3) {
        // Add empty limit field if missing
        result.push('');
        console.log('📝 [MemoParser] Added empty limit field');
      } else if (result.length === 4) {
        // Add affiliate field
        result.push('');
      } else if (result.length === 5) {
        // Add fee field
        result.push('');
      }
    }

    const currentAffiliate = result[4] || '';
    const currentFee = result[5] || '';

    // Handle affiliate injection
    if (!currentAffiliate) {
      // No existing affiliate - inject directly
      result[4] = affiliateAddress;
      result[5] = affiliateFeeBp;
      changes.push(`Added affiliate: ${affiliateAddress}`);
      changes.push(`Added affiliate fee: ${affiliateFeeBp} BP`);
    } else {
      // Existing affiliate - append with "/" separator  
      result[4] = `${currentAffiliate}/${affiliateAddress}`;
      result[5] = currentFee ? `${currentFee}/${affiliateFeeBp}` : affiliateFeeBp;
      changes.push(`Appended affiliate: ${currentAffiliate} → ${result[4]}`);
      changes.push(`Appended affiliate fee: ${currentFee || '0'} → ${result[5]} BP`);
    }

    return result.join(':');
  }

  /**
   * Legacy method - kept for backward compatibility
   * @deprecated Use modifySwapMemoWithAffiliate for swap memos
   */
  modifyMemoWithAffiliate(
    memo: string, 
    affiliateAddress: string, 
    affiliateFeeBp: string = '50' // Default 0.5% fee
  ): MemoModificationResult {
    console.log('🔧 [MemoParser] Modifying memo with affiliate...');
    console.log('📝 [MemoParser] Original memo:', memo);
    console.log('🤝 [MemoParser] Affiliate address:', affiliateAddress);
    console.log('💰 [MemoParser] Affiliate fee BP:', affiliateFeeBp);

    const parsed = this.parseMemo(memo);
    const changes: string[] = [];
    const errors: string[] = [];

    // Only modify swaps and add liquidity memos for now
    if (parsed.type !== 'swap' && parsed.type !== 'add') {
      return {
        success: false,
        originalMemo: memo,
        modifiedMemo: memo,
        changes: [],
        errors: [`Memo type '${parsed.type}' does not support affiliate fees`]
      };
    }

    // For swap memos, use the new enhanced method
    if (parsed.type === 'swap') {
      return this.modifySwapMemoWithAffiliate(memo, affiliateAddress, affiliateFeeBp);
    }

    // Validate affiliate address format
    if (!this.isValidAffiliateAddress(affiliateAddress)) {
      errors.push(`Invalid affiliate address format: ${affiliateAddress}`);
    }

    // Validate fee basis points (should be 0-10000)
    const feeNumber = parseInt(affiliateFeeBp);
    if (isNaN(feeNumber) || feeNumber < 0 || feeNumber > 10000) {
      errors.push(`Invalid affiliate fee: ${affiliateFeeBp}. Must be 0-10000 basis points`);
    }

    if (errors.length > 0) {
      return {
        success: false,
        originalMemo: memo,
        modifiedMemo: memo,
        changes: [],
        errors
      };
    }

    // Build modified memo
    const modifiedMemo = this.buildModifiedMemo(parsed, affiliateAddress, affiliateFeeBp, changes);

    console.log('✅ [MemoParser] Modification complete');
    console.log('📝 [MemoParser] Modified memo:', modifiedMemo);
    console.log('🔄 [MemoParser] Changes made:', changes);

    return {
      success: true,
      originalMemo: memo,
      modifiedMemo,
      changes
    };
  }

  /**
   * Build the modified memo string with affiliate information
   */
  private buildModifiedMemo(
    parsed: ParsedMemo, 
    affiliateAddress: string, 
    affiliateFeeBp: string,
    changes: string[]
  ): string {
    const parts: string[] = [parsed.action];

    if (parsed.type === 'swap') {
      // Swap format: =:ASSET:DEST_ADDR:LIM/STREAMING:AFFILIATE_ADDR:AFFILIATE_FEE_BP
      parts.push(parsed.targetAsset || '');
      parts.push(parsed.targetAddress || '');
      parts.push(parsed.limit || '');

      // Handle affiliate
      if (parsed.affiliate) {
        if (parsed.affiliate !== affiliateAddress) {
          changes.push(`Updated affiliate address: ${parsed.affiliate} → ${affiliateAddress}`);
        }
      } else {
        changes.push(`Added affiliate address: ${affiliateAddress}`);
      }
      parts.push(affiliateAddress);

      // Handle fee
      if (parsed.fee) {
        if (parsed.fee !== affiliateFeeBp) {
          changes.push(`Updated affiliate fee: ${parsed.fee} BP → ${affiliateFeeBp} BP`);
        }
      } else {
        changes.push(`Added affiliate fee: ${affiliateFeeBp} BP`);
      }
      parts.push(affiliateFeeBp);

      // Add any remaining parts
      if (parsed.remainingParts && parsed.remainingParts.length > 0) {
        parts.push(...parsed.remainingParts);
      }

    } else if (parsed.type === 'add') {
      // Add liquidity format: +:ASSET:DEST_ADDR:AFFILIATE_ADDR:AFFILIATE_FEE_BP
      parts.push(parsed.targetAsset || '');
      parts.push(parsed.targetAddress || '');

      // Handle affiliate
      if (parsed.affiliate) {
        if (parsed.affiliate !== affiliateAddress) {
          changes.push(`Updated affiliate address: ${parsed.affiliate} → ${affiliateAddress}`);
        }
      } else {
        changes.push(`Added affiliate address: ${affiliateAddress}`);
      }
      parts.push(affiliateAddress);

      // Handle fee
      if (parsed.fee) {
        if (parsed.fee !== affiliateFeeBp) {
          changes.push(`Updated affiliate fee: ${parsed.fee} BP → ${affiliateFeeBp} BP`);
        }
      } else {
        changes.push(`Added affiliate fee: ${affiliateFeeBp} BP`);
      }
      parts.push(affiliateFeeBp);

      // Add any remaining parts
      if (parsed.remainingParts && parsed.remainingParts.length > 0) {
        parts.push(...parsed.remainingParts);
      }
    }

    return parts.join(':');
  }

  /**
   * Validate if an address is a valid THORChain affiliate address format
   */
  private isValidAffiliateAddress(address: string): boolean {
    if (!address || address.length === 0) return false;
    
    // THORChain addresses start with thor (mainnet) or sthor (stagenet) 
    // and can vary in length (typically 39-45 characters after prefix)
    const thorAddressRegex = /^s?thor[a-z0-9]{35,50}$/;
    
    // Also accept other common address formats for cross-chain affiliates
    const btcAddressRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/;
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    
    return thorAddressRegex.test(address) || 
           btcAddressRegex.test(address) || 
           ethAddressRegex.test(address);
  }

  /**
   * Extract just the user input parts from a memo (everything except affiliate info)
   */
  extractUserInput(memo: string): string {
    const parsed = this.parseMemo(memo);
    
    if (parsed.type === 'swap') {
      // Return: =:ASSET:DEST_ADDR:LIM/STREAMING (without affiliate parts)
      const parts = [
        parsed.action,
        parsed.targetAsset || '',
        parsed.targetAddress || '',
        parsed.limit || ''
      ];
      return parts.join(':');
    } else if (parsed.type === 'add') {
      // Return: +:ASSET:DEST_ADDR (without affiliate parts)
      const parts = [
        parsed.action,
        parsed.targetAsset || '',
        parsed.targetAddress || ''
      ];
      return parts.join(':');
    }
    
    // For other types, return original memo
    return memo;
  }

  /**
   * Check if a memo already has affiliate information
   */
  hasAffiliateInfo(memo: string): boolean {
    const parsed = this.parseMemo(memo);
    return !!(parsed.affiliate || parsed.fee);
  }

  /**
   * Replace user input parts while preserving existing affiliate info
   */
  replaceUserInput(originalMemo: string, newUserInput: string): string {
    const parsed = this.parseMemo(originalMemo);
    const newParsed = this.parseMemo(newUserInput);
    
    if (parsed.type === 'swap' && newParsed.type === 'swap') {
      // Keep affiliate info from original, use user input from new
      const parts = [
        newParsed.action,
        newParsed.targetAsset || '',
        newParsed.targetAddress || '',
        newParsed.limit || '',
        parsed.affiliate || '', // Keep original affiliate
        parsed.fee || ''        // Keep original fee
      ];
      
      // Add remaining parts from original
      if (parsed.remainingParts && parsed.remainingParts.length > 0) {
        parts.push(...parsed.remainingParts);
      }
      
      return parts.join(':');
    } else if (parsed.type === 'add' && newParsed.type === 'add') {
      // Keep affiliate info from original, use user input from new
      const parts = [
        newParsed.action,
        newParsed.targetAsset || '',
        newParsed.targetAddress || '',
        parsed.affiliate || '', // Keep original affiliate
        parsed.fee || ''        // Keep original fee
      ];
      
      // Add remaining parts from original
      if (parsed.remainingParts && parsed.remainingParts.length > 0) {
        parts.push(...parsed.remainingParts);
      }
      
      return parts.join(':');
    }
    
    // For non-matching types or unsupported types, return new input
    return newUserInput;
  }
}
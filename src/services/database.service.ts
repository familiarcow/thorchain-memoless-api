import { Pool } from 'pg';
import Database from 'better-sqlite3';

export interface RegistrationRecord {
  id?: string;
  txHash: string;
  asset: string;
  memo: string;
  referenceId?: string;
  status: 'pending' | 'confirmed' | 'failed';
  userAddress?: string;
  height?: string;
  registrationHash?: string;
  registeredBy?: string;
  inboundAddress?: string;
  dustThreshold?: number;
  chain?: string;
  decimals?: number;
  priceUSD?: number;
  expiresAt?: string;
  maxUse?: number;
  usageCount?: number;
  createdAt?: Date;
  confirmedAt?: Date;
}

export class DatabaseService {
  private pool: Pool | null = null;
  private sqlite: Database.Database | null = null;
  private dbType: 'postgresql' | 'sqlite' | 'none';
  private isEnabled: boolean = false;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.log('🔴 [DatabaseService] DISABLED - No DATABASE_URL provided');
      console.log('📝 [DatabaseService] Running without persistent storage - registrations will not be saved');
      this.dbType = 'none';
      this.isEnabled = false;
      return;
    }

    try {
      console.log('💾 [DatabaseService] Initializing database connection...');
      console.log('🔗 [DatabaseService] Database URL:', databaseUrl.replace(/:[^:@]*@/, ':***@'));

      if (databaseUrl.startsWith('sqlite:')) {
        this.dbType = 'sqlite';
        const dbPath = databaseUrl.replace('sqlite:', '');
        console.log('📂 [DatabaseService] Using SQLite database:', dbPath);
        this.sqlite = new Database(dbPath);
        // Enable WAL mode for better performance and concurrency
        this.sqlite.pragma('journal_mode = WAL');
        this.isEnabled = true;
      } else {
        this.dbType = 'postgresql';
        console.log('🐘 [DatabaseService] Using PostgreSQL database');
        this.pool = new Pool({
          connectionString: databaseUrl,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
        this.isEnabled = true;
      }
      
      console.log('🟢 [DatabaseService] ENABLED - Successfully configured for:', this.dbType);
    } catch (error) {
      console.error('❌ [DatabaseService] Failed to initialize database:', (error as Error).message);
      console.log('🔴 [DatabaseService] DISABLED - Continuing without persistent storage');
      this.dbType = 'none';
      this.isEnabled = false;
    }
  }

  async initialize() {
    if (!this.isEnabled) {
      return;
    }

    console.log('🏗️  [DatabaseService] Creating database tables...');
    
    if (this.dbType === 'sqlite' && this.sqlite) {
      // SQLite table creation
      this.sqlite.exec(`
        CREATE TABLE IF NOT EXISTS registrations (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          tx_hash TEXT UNIQUE NOT NULL,
          asset TEXT NOT NULL,
          memo TEXT NOT NULL,
          reference_id TEXT,
          status TEXT DEFAULT 'pending',
          user_address TEXT,
          height TEXT,
          registration_hash TEXT,
          registered_by TEXT,
          inbound_address TEXT,
          dust_threshold INTEGER,
          chain TEXT,
          decimals INTEGER,
          price_usd REAL,
          expires_at TEXT,
          max_use INTEGER,
          usage_count INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          confirmed_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_registrations_tx_hash ON registrations(tx_hash);
        CREATE INDEX IF NOT EXISTS idx_registrations_reference_id ON registrations(reference_id);
        CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
      `);
      
      // Add new columns for existing databases (SQLite migration)
      try {
        this.sqlite.exec(`ALTER TABLE registrations ADD COLUMN height TEXT;`);
      } catch (e) { /* Column already exists */ }
      try {
        this.sqlite.exec(`ALTER TABLE registrations ADD COLUMN registration_hash TEXT;`);
      } catch (e) { /* Column already exists */ }
      try {
        this.sqlite.exec(`ALTER TABLE registrations ADD COLUMN registered_by TEXT;`);
      } catch (e) { /* Column already exists */ }
      
      console.log('✅ [DatabaseService] SQLite tables created successfully');
    } else if (this.dbType === 'postgresql' && this.pool) {
      // PostgreSQL table creation
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS registrations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tx_hash VARCHAR(64) UNIQUE NOT NULL,
          asset VARCHAR(50) NOT NULL,
          memo TEXT NOT NULL,
          reference_id VARCHAR(20),
          status VARCHAR(20) DEFAULT 'pending',
          user_address VARCHAR(100),
          height VARCHAR(20),
          registration_hash VARCHAR(64),
          registered_by VARCHAR(100),
          inbound_address VARCHAR(100),
          dust_threshold BIGINT,
          chain VARCHAR(20),
          decimals INTEGER,
          price_usd DECIMAL(20,8),
          expires_at VARCHAR(20),
          max_use INTEGER,
          usage_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          confirmed_at TIMESTAMP,
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_registrations_tx_hash ON registrations(tx_hash);
        CREATE INDEX IF NOT EXISTS idx_registrations_reference_id ON registrations(reference_id);
        CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
      `);
      
      // Add new columns for existing databases (PostgreSQL migration)
      try {
        await this.pool.query(`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS height VARCHAR(20);`);
        await this.pool.query(`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS registration_hash VARCHAR(64);`);
        await this.pool.query(`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS registered_by VARCHAR(100);`);
      } catch (e) {
        console.log('⚠️ [DatabaseService] PostgreSQL migration completed or columns already exist');
      }
      
      console.log('✅ [DatabaseService] PostgreSQL tables created successfully');
    }
  }

  async createRegistration(record: RegistrationRecord): Promise<string> {
    if (!this.isEnabled) {
      // Generate a mock ID for consistency
      return 'mock-' + Math.random().toString(36).substr(2, 16);
    }
    
    console.log('📝 [DatabaseService] Creating new registration record...');
    
    if (this.dbType === 'sqlite' && this.sqlite) {
      const stmt = this.sqlite.prepare(`
        INSERT INTO registrations (
          tx_hash, asset, memo, status, user_address, 
          reference_id, height, registration_hash, registered_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        record.txHash,
        record.asset, 
        record.memo,
        record.status || 'pending',
        record.userAddress || null,
        record.referenceId || null,
        record.height || null,
        record.registrationHash || null,
        record.registeredBy || null
      );
      
      // Get the generated ID
      const getIdStmt = this.sqlite.prepare('SELECT id FROM registrations WHERE rowid = ?');
      const idResult = getIdStmt.get(result.lastInsertRowid) as { id: string };
      
      console.log('✅ [DatabaseService] Registration created with ID:', idResult.id);
      return idResult.id;
    } else if (this.dbType === 'postgresql' && this.pool) {
      const query = `
        INSERT INTO registrations (
          tx_hash, asset, memo, status, user_address, 
          reference_id, height, registration_hash, registered_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;
      
      const values = [
        record.txHash,
        record.asset, 
        record.memo,
        record.status || 'pending',
        record.userAddress,
        record.referenceId,
        record.height,
        record.registrationHash,
        record.registeredBy
      ];

      const result = await this.pool.query(query, values);
      console.log('✅ [DatabaseService] Registration created with ID:', result.rows[0].id);
      return result.rows[0].id;
    }
    
    throw new Error('Database not initialized');
  }

  async updateRegistration(id: string, updates: Partial<RegistrationRecord>): Promise<void> {
    if (!this.isEnabled) {
      return;
    }
    
    console.log('🔄 [DatabaseService] Updating registration:', id);
    
    if (this.dbType === 'sqlite' && this.sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];

      // Build dynamic UPDATE query
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          // Convert camelCase to snake_case for database columns
          const dbColumn = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          setClauses.push(`${dbColumn} = ?`);
          values.push(value);
        }
      });

      if (setClauses.length === 0) return;

      setClauses.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const query = `
        UPDATE registrations 
        SET ${setClauses.join(', ')}
        WHERE id = ?
      `;

      this.sqlite.prepare(query).run(...values);
    } else if (this.dbType === 'postgresql' && this.pool) {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          // Convert camelCase to snake_case for database columns
          const dbColumn = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          setClauses.push(`${dbColumn} = $${paramIndex++}`);
          values.push(value);
        }
      });

      if (setClauses.length === 0) return;

      setClauses.push('updated_at = NOW()');
      values.push(id);

      const query = `
        UPDATE registrations 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await this.pool.query(query, values);
    }
    
    console.log('✅ [DatabaseService] Registration updated successfully');
  }

  async getRegistration(id: string): Promise<RegistrationRecord | null> {
    if (!this.isEnabled) {
      return null;
    }
    
    console.log('🔍 [DatabaseService] Getting registration:', id);
    
    if (this.dbType === 'sqlite' && this.sqlite) {
      const stmt = this.sqlite.prepare(`
        SELECT 
          id, tx_hash as txHash, asset, memo, reference_id as referenceId,
          status, user_address as userAddress,           inbound_address as inboundAddress, dust_threshold as dustThreshold,
          chain, decimals, price_usd as priceUSD, expires_at as expiresAt,
          max_use as maxUse, usage_count as usageCount,
          created_at as createdAt, confirmed_at as confirmedAt
        FROM registrations 
        WHERE id = ?
      `);
      
      const result = stmt.get(id) as RegistrationRecord | undefined;
      return result || null;
    } else if (this.dbType === 'postgresql' && this.pool) {
      const query = `
        SELECT 
          id, tx_hash as "txHash", asset, memo, reference_id as "referenceId",
          status, user_address as "userAddress",           inbound_address as "inboundAddress", dust_threshold as "dustThreshold",
          chain, decimals, price_usd as "priceUSD", expires_at as "expiresAt",
          max_use as "maxUse", usage_count as "usageCount",
          created_at as "createdAt", confirmed_at as "confirmedAt"
        FROM registrations 
        WHERE id = $1
      `;
      
      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    }
    
    return null;
  }

  async getRegistrationByTxHash(txHash: string): Promise<RegistrationRecord | null> {
    if (!this.isEnabled) {
      return null;
    }
    
    console.log('🔍 [DatabaseService] Getting registration by txHash:', txHash);
    
    if (this.dbType === 'sqlite' && this.sqlite) {
      const stmt = this.sqlite.prepare(`
        SELECT 
          id, tx_hash as txHash, asset, memo, reference_id as referenceId,
          status, user_address as userAddress,           inbound_address as inboundAddress, dust_threshold as dustThreshold,
          chain, decimals, price_usd as priceUSD, expires_at as expiresAt,
          max_use as maxUse, usage_count as usageCount,
          created_at as createdAt, confirmed_at as confirmedAt
        FROM registrations 
        WHERE tx_hash = ?
      `);
      
      const result = stmt.get(txHash) as RegistrationRecord | undefined;
      return result || null;
    } else if (this.dbType === 'postgresql' && this.pool) {
      const query = `
        SELECT 
          id, tx_hash as "txHash", asset, memo, reference_id as "referenceId",
          status, user_address as "userAddress",           inbound_address as "inboundAddress", dust_threshold as "dustThreshold",
          chain, decimals, price_usd as "priceUSD", expires_at as "expiresAt",
          max_use as "maxUse", usage_count as "usageCount",
          created_at as "createdAt", confirmed_at as "confirmedAt"
        FROM registrations 
        WHERE tx_hash = $1
      `;
      
      const result = await this.pool.query(query, [txHash]);
      return result.rows[0] || null;
    }
    
    return null;
  }

  async findExistingRegistration(asset: string, memo: string): Promise<RegistrationRecord | null> {
    if (!this.isEnabled) {
      return null;
    }
    
    console.log('🔍 [DatabaseService] Finding existing registration for asset:', asset);
    
    if (this.dbType === 'sqlite' && this.sqlite) {
      const stmt = this.sqlite.prepare(`
        SELECT 
          id, tx_hash as txHash, asset, memo, reference_id as referenceId,
          status, created_at as createdAt, confirmed_at as confirmedAt
        FROM registrations 
        WHERE asset = ? AND memo = ? 
        ORDER BY created_at DESC 
        LIMIT 1
      `);
      
      const result = stmt.get(asset, memo) as RegistrationRecord | undefined;
      return result || null;
    } else if (this.dbType === 'postgresql' && this.pool) {
      const query = `
        SELECT 
          id, tx_hash as "txHash", asset, memo, reference_id as "referenceId",
          status, created_at as "createdAt", confirmed_at as "confirmedAt"
        FROM registrations 
        WHERE asset = $1 AND memo = $2 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      const result = await this.pool.query(query, [asset, memo]);
      return result.rows[0] || null;
    }
    
    return null;
  }

  async cleanup() {
    if (!this.isEnabled) {
      return;
    }
    
    console.log('🧹 [DatabaseService] Cleaning up database connections...');
    
    if (this.dbType === 'postgresql' && this.pool) {
      await this.pool.end();
      console.log('✅ [DatabaseService] PostgreSQL pool closed');
    } else if (this.dbType === 'sqlite' && this.sqlite) {
      this.sqlite.close();
      console.log('✅ [DatabaseService] SQLite database closed');
    }
  }

  /**
   * Check if database is enabled and operational
   */
  isDatabaseEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get database status information
   */
  getDatabaseStatus() {
    return {
      enabled: this.isEnabled,
      type: this.dbType,
      connected: this.isEnabled && (
        (this.dbType === 'sqlite' && this.sqlite !== null) ||
        (this.dbType === 'postgresql' && this.pool !== null)
      )
    };
  }
}
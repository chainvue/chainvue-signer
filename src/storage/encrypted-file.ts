/**
 * Encrypted file storage provider
 *
 * Fallback for systems without OS keychain (headless Linux servers)
 * Uses AES-256-GCM with scrypt-derived key from password
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import type { StorageProvider } from '../types.js';

const STORAGE_DIR = path.join(os.homedir(), '.chainvue');
const KEYS_FILE = path.join(STORAGE_DIR, 'keys.enc');
const SALT_FILE = path.join(STORAGE_DIR, '.salt');

const ALGORITHM = 'aes-256-gcm';
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

interface EncryptedStore {
  keys: Record<string, string>; // name -> encrypted WIF
}

export class EncryptedFileStorage implements StorageProvider {
  readonly name = 'encrypted-file';
  private password: string | null = null;
  private derivedKey: Buffer | null = null;
  private salt: Buffer | null = null;

  async isAvailable(): Promise<boolean> {
    // Always available as fallback
    return true;
  }

  /**
   * Initialize storage - prompts for password if needed
   */
  private async initialize(): Promise<void> {
    if (this.derivedKey) {
      return;
    }

    // Ensure storage directory exists
    await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });

    // Get or create salt
    this.salt = await this.getOrCreateSalt();

    // Get password from environment or prompt
    this.password = process.env.CHAINVUE_SIGNER_PASSWORD || (await this.promptPassword());

    // Derive key from password
    this.derivedKey = await this.deriveKey(this.password, this.salt);
  }

  private async getOrCreateSalt(): Promise<Buffer> {
    try {
      const saltHex = await fs.readFile(SALT_FILE, 'utf-8');
      return Buffer.from(saltHex, 'hex');
    } catch {
      // Create new salt
      const salt = crypto.randomBytes(SALT_LENGTH);
      await fs.writeFile(SALT_FILE, salt.toString('hex'), { mode: 0o600 });
      return salt;
    }
  }

  private async promptPassword(): Promise<string> {
    // Check if running in TTY
    if (!process.stdin.isTTY) {
      throw new Error(
        'No password provided. Set CHAINVUE_SIGNER_PASSWORD environment variable for non-interactive mode.'
      );
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: true,
    });

    return new Promise((resolve, reject) => {
      // Check if first run
      fs.access(KEYS_FILE)
        .then(() => {
          process.stderr.write('Enter wallet password: ');
        })
        .catch(() => {
          process.stderr.write('Create wallet password (min 12 chars): ');
        });

      // Hide password input
      if (process.stdin.isTTY) {
        (process.stdin as any).setRawMode(true);
      }

      let password = '';
      process.stdin.on('data', (char) => {
        const c = char.toString();
        if (c === '\n' || c === '\r' || c === '\u0004') {
          if (process.stdin.isTTY) {
            (process.stdin as any).setRawMode(false);
          }
          process.stderr.write('\n');
          rl.close();

          if (password.length < 12) {
            reject(new Error('Password must be at least 12 characters'));
          } else {
            resolve(password);
          }
        } else if (c === '\u007F' || c === '\b') {
          // Backspace
          password = password.slice(0, -1);
        } else if (c === '\u0003') {
          // Ctrl+C
          reject(new Error('Cancelled'));
        } else {
          password += c;
        }
      });
    });
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(
        password,
        salt,
        KEY_LENGTH,
        { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve(derivedKey);
        }
      );
    });
  }

  private encrypt(plaintext: string): string {
    if (!this.derivedKey) {
      throw new Error('Storage not initialized');
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.derivedKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  private decrypt(encryptedData: string): string {
    if (!this.derivedKey) {
      throw new Error('Storage not initialized');
    }

    const [ivHex, authTagHex, ciphertext] = encryptedData.split(':');
    if (!ivHex || !authTagHex || !ciphertext) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, this.derivedKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private async readStore(): Promise<EncryptedStore> {
    try {
      const data = await fs.readFile(KEYS_FILE, 'utf-8');
      return JSON.parse(data) as EncryptedStore;
    } catch {
      return { keys: {} };
    }
  }

  private async writeStore(store: EncryptedStore): Promise<void> {
    await fs.writeFile(KEYS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  }

  async setKey(name: string, wif: string): Promise<void> {
    await this.initialize();

    const store = await this.readStore();
    store.keys[name] = this.encrypt(wif);
    await this.writeStore(store);
  }

  async getKey(name: string): Promise<string | null> {
    await this.initialize();

    const store = await this.readStore();
    const encrypted = store.keys[name];

    if (!encrypted) {
      return null;
    }

    try {
      return this.decrypt(encrypted);
    } catch (error) {
      throw new Error('Failed to decrypt key. Wrong password?');
    }
  }

  async deleteKey(name: string): Promise<boolean> {
    await this.initialize();

    const store = await this.readStore();
    if (!(name in store.keys)) {
      return false;
    }

    delete store.keys[name];
    await this.writeStore(store);
    return true;
  }

  async listKeys(): Promise<string[]> {
    await this.initialize();

    const store = await this.readStore();
    return Object.keys(store.keys);
  }
}

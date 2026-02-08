/**
 * Storage layer - handles secure key storage with automatic fallback
 *
 * Priority:
 * 1. OS Keychain (most secure, requires desktop environment)
 * 2. Encrypted file (fallback for headless servers)
 */

import type { StorageProvider, StoredWallet, WalletMetadata } from '../types.js';
import { KeychainStorage } from './keychain.js';
import { EncryptedFileStorage } from './encrypted-file.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const METADATA_FILE = path.join(os.homedir(), '.chainvue', 'wallets.json');

export class SecureStorage {
  private provider: StorageProvider | null = null;
  private metadata: WalletMetadata | null = null;

  /**
   * Get the active storage provider, initializing if needed
   */
  async getProvider(): Promise<StorageProvider> {
    if (this.provider) {
      return this.provider;
    }

    // Try keychain first
    const keychainStorage = new KeychainStorage();
    if (await keychainStorage.isAvailable()) {
      console.error(`[Storage] Using ${keychainStorage.name}`);
      this.provider = keychainStorage;
      return this.provider;
    }

    // Fall back to encrypted file
    const encryptedStorage = new EncryptedFileStorage();
    console.error(`[Storage] Using ${encryptedStorage.name} (keychain not available)`);
    this.provider = encryptedStorage;
    return this.provider;
  }

  /**
   * Load wallet metadata (non-sensitive: names, addresses, networks)
   */
  private async loadMetadata(): Promise<WalletMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    try {
      const data = await fs.readFile(METADATA_FILE, 'utf-8');
      this.metadata = JSON.parse(data);
      return this.metadata!;
    } catch {
      this.metadata = { wallets: {} };
      return this.metadata;
    }
  }

  /**
   * Save wallet metadata
   */
  private async saveMetadata(metadata: WalletMetadata): Promise<void> {
    const dir = path.dirname(METADATA_FILE);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(METADATA_FILE, JSON.stringify(metadata, null, 2), { mode: 0o600 });
    this.metadata = metadata;
  }

  /**
   * Store a wallet
   */
  async storeWallet(wallet: StoredWallet, wif: string): Promise<void> {
    const provider = await this.getProvider();

    // Store the key securely
    await provider.setKey(wallet.name, wif);

    // Store metadata separately (non-sensitive)
    const metadata = await this.loadMetadata();
    metadata.wallets[wallet.name] = {
      address: wallet.address,
      network: wallet.network,
      createdAt: wallet.createdAt,
    };
    await this.saveMetadata(metadata);
  }

  /**
   * Get a wallet's private key
   */
  async getWalletKey(name: string): Promise<string | null> {
    const provider = await this.getProvider();
    return provider.getKey(name);
  }

  /**
   * List all wallets with their metadata
   */
  async listWallets(): Promise<StoredWallet[]> {
    const metadata = await this.loadMetadata();

    return Object.entries(metadata.wallets).map(([name, data]) => ({
      name,
      ...data,
    }));
  }

  /**
   * Get a single wallet's metadata
   */
  async getWallet(name: string): Promise<StoredWallet | null> {
    const metadata = await this.loadMetadata();
    const wallet = metadata.wallets[name];

    if (!wallet) {
      return null;
    }

    return { name, ...wallet };
  }

  /**
   * Delete a wallet
   */
  async deleteWallet(name: string): Promise<boolean> {
    const provider = await this.getProvider();

    // Delete the key
    const deleted = await provider.deleteKey(name);

    // Delete metadata
    const metadata = await this.loadMetadata();
    delete metadata.wallets[name];
    await this.saveMetadata(metadata);

    return deleted;
  }

  /**
   * Check if a wallet exists
   */
  async hasWallet(name: string): Promise<boolean> {
    const metadata = await this.loadMetadata();
    return name in metadata.wallets;
  }
}

// Singleton instance
export const storage = new SecureStorage();

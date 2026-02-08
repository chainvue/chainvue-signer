/**
 * OS Keychain storage provider using keytar
 *
 * - macOS: Keychain Access
 * - Linux: Secret Service API (GNOME Keyring / KWallet)
 * - Windows: Credential Manager
 */

import type { StorageProvider } from '../types.js';

const SERVICE_NAME = 'chainvue-signer';

export class KeychainStorage implements StorageProvider {
  readonly name = 'os-keychain';
  private keytar: typeof import('keytar') | null = null;
  private available: boolean | null = null;

  private async getKeytar(): Promise<typeof import('keytar') | null> {
    if (this.keytar !== null) {
      return this.keytar;
    }

    try {
      // Dynamic import to handle cases where keytar isn't available
      this.keytar = await import('keytar');
      return this.keytar;
    } catch (error) {
      console.warn('[KeychainStorage] keytar not available:', (error as Error).message);
      this.keytar = null;
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    const keytar = await this.getKeytar();
    if (!keytar) {
      this.available = false;
      return false;
    }

    try {
      // Test if keychain is accessible
      await keytar.findCredentials(SERVICE_NAME);
      this.available = true;
      return true;
    } catch (error) {
      console.warn('[KeychainStorage] Keychain not accessible:', (error as Error).message);
      this.available = false;
      return false;
    }
  }

  async setKey(name: string, wif: string): Promise<void> {
    const keytar = await this.getKeytar();
    if (!keytar) {
      throw new Error('Keychain not available');
    }

    await keytar.setPassword(SERVICE_NAME, name, wif);
  }

  async getKey(name: string): Promise<string | null> {
    const keytar = await this.getKeytar();
    if (!keytar) {
      throw new Error('Keychain not available');
    }

    return await keytar.getPassword(SERVICE_NAME, name);
  }

  async deleteKey(name: string): Promise<boolean> {
    const keytar = await this.getKeytar();
    if (!keytar) {
      throw new Error('Keychain not available');
    }

    return await keytar.deletePassword(SERVICE_NAME, name);
  }

  async listKeys(): Promise<string[]> {
    const keytar = await this.getKeytar();
    if (!keytar) {
      throw new Error('Keychain not available');
    }

    const credentials = await keytar.findCredentials(SERVICE_NAME);
    return credentials.map((c) => c.account);
  }
}

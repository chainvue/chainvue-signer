/**
 * Core types for the ChainVue Signer
 */

export interface StoredWallet {
  name: string;
  address: string;
  network: 'mainnet' | 'testnet';
  createdAt: string;
}

export interface WalletWithKey extends StoredWallet {
  wif: string;
}

export interface StorageProvider {
  /**
   * Store a wallet's private key securely
   */
  setKey(name: string, wif: string): Promise<void>;

  /**
   * Retrieve a wallet's private key
   */
  getKey(name: string): Promise<string | null>;

  /**
   * Delete a wallet's private key
   */
  deleteKey(name: string): Promise<boolean>;

  /**
   * List all stored wallet names
   */
  listKeys(): Promise<string[]>;

  /**
   * Check if storage is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get storage provider name
   */
  readonly name: string;
}

export interface WalletMetadata {
  wallets: Record<string, Omit<StoredWallet, 'name'>>;
}

export interface SignTransactionRequest {
  wallet: string;
  unsignedTx: string;
  inputs: Array<{
    txid: string;
    vout: number;
    scriptPubKey: string;
    amount: number;
  }>;
}

export interface SignTransactionResponse {
  signedTx: string;
  txid: string;
}

export type Network = 'mainnet' | 'testnet';

export const NETWORK_CONFIG = {
  mainnet: {
    chainId: 'i5w5MuNik5NtLcYmNzcvaoixooEebB6MGV',
    pubKeyHash: 0x3c,
    scriptHash: 0x55,
    wif: 0xbc,
  },
  testnet: {
    chainId: 'iJhCezBExJHvtyH3fGhNnt2NhU4Ztkf2yq',
    pubKeyHash: 0x3c,
    scriptHash: 0x55,
    wif: 0xbc,
  },
} as const;

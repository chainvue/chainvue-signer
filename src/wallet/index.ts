/**
 * Wallet module - high-level wallet operations
 */

export * from './keys.js';
export * from './signer.js';

import { storage } from '../storage/index.js';
import { validateWif, wifToAddress, generateWif } from './keys.js';
import { signTransaction } from './signer.js';
import type { StoredWallet, Network } from '../types.js';

/**
 * Import a wallet from WIF private key
 */
export async function importWallet(
  name: string,
  wif: string,
  network: Network = 'mainnet'
): Promise<StoredWallet> {
  // Validate name
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error('Wallet name must be alphanumeric with underscores/dashes only');
  }

  if (name.length > 32) {
    throw new Error('Wallet name must be 32 characters or less');
  }

  // Check if wallet already exists
  if (await storage.hasWallet(name)) {
    throw new Error(`Wallet "${name}" already exists`);
  }

  // Validate WIF
  const validation = validateWif(wif);
  if (!validation.valid) {
    throw new Error(`Invalid private key: ${validation.error}`);
  }

  // Derive address
  const address = await wifToAddress(wif);

  // Create wallet object
  const wallet: StoredWallet = {
    name,
    address,
    network,
    createdAt: new Date().toISOString(),
  };

  // Store securely
  await storage.storeWallet(wallet, wif);

  return wallet;
}

/**
 * Create a new wallet with generated key
 */
export async function createWallet(
  name: string,
  network: Network = 'mainnet'
): Promise<StoredWallet> {
  const wif = generateWif(true); // compressed
  return importWallet(name, wif, network);
}

/**
 * List all wallets
 */
export async function listWallets(): Promise<StoredWallet[]> {
  return storage.listWallets();
}

/**
 * Get a wallet by name
 */
export async function getWallet(name: string): Promise<StoredWallet | null> {
  return storage.getWallet(name);
}

/**
 * Delete a wallet
 */
export async function deleteWallet(name: string): Promise<boolean> {
  const exists = await storage.hasWallet(name);
  if (!exists) {
    throw new Error(`Wallet "${name}" not found`);
  }

  return storage.deleteWallet(name);
}

/**
 * Sign a transaction using a wallet
 */
export async function signWithWallet(
  walletName: string,
  unsignedTxHex: string,
  inputs: Array<{
    scriptPubKey: string;
    amount: number;
  }>
): Promise<{ signedTx: string; txid: string }> {
  // Get wallet
  const wallet = await storage.getWallet(walletName);
  if (!wallet) {
    throw new Error(`Wallet "${walletName}" not found`);
  }

  // Get private key
  const wif = await storage.getWalletKey(walletName);
  if (!wif) {
    throw new Error(`Private key for wallet "${walletName}" not found`);
  }

  // Sign transaction
  return signTransaction(wif, unsignedTxHex, inputs);
}

/**
 * Export wallet address (safe to share)
 */
export async function exportAddress(walletName: string): Promise<string> {
  const wallet = await storage.getWallet(walletName);
  if (!wallet) {
    throw new Error(`Wallet "${walletName}" not found`);
  }

  return wallet.address;
}

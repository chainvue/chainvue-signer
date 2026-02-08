/**
 * MCP Tool: import_key
 *
 * Imports a private key (WIF format) and stores it securely
 */

import { z } from 'zod';
import { importWallet } from '../wallet/index.js';

export const importKeySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric with underscores/dashes only'),
  wif: z.string().min(50).max(60),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
});

export type ImportKeyInput = z.infer<typeof importKeySchema>;

export async function importKeyHandler(input: ImportKeyInput) {
  const wallet = await importWallet(input.name, input.wif, input.network);

  return {
    success: true,
    wallet: {
      name: wallet.name,
      address: wallet.address,
      network: wallet.network,
      createdAt: wallet.createdAt,
    },
    message: `Wallet "${wallet.name}" imported successfully. Address: ${wallet.address}`,
  };
}

export const importKeyTool = {
  name: 'import_key',
  description:
    'Import a private key (WIF format) and store it securely in the OS keychain or encrypted file. The key is never sent over the network.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'A unique name for this wallet (alphanumeric, underscores, dashes)',
        minLength: 1,
        maxLength: 32,
      },
      wif: {
        type: 'string',
        description: 'The private key in WIF (Wallet Import Format)',
      },
      network: {
        type: 'string',
        enum: ['mainnet', 'testnet'],
        default: 'mainnet',
        description: 'The network this wallet is for',
      },
    },
    required: ['name', 'wif'],
  },
  handler: importKeyHandler,
};

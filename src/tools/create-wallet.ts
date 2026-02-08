/**
 * MCP Tool: create_wallet
 *
 * Creates a new wallet with a randomly generated private key
 */

import { z } from 'zod';
import { createWallet } from '../wallet/index.js';

export const createWalletSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be alphanumeric with underscores/dashes only'),
  network: z.enum(['mainnet', 'testnet']).default('mainnet'),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;

export async function createWalletHandler(input: CreateWalletInput) {
  const wallet = await createWallet(input.name, input.network);

  return {
    success: true,
    wallet: {
      name: wallet.name,
      address: wallet.address,
      network: wallet.network,
      createdAt: wallet.createdAt,
    },
    message: `Wallet "${wallet.name}" created successfully. Address: ${wallet.address}`,
    warning:
      'The private key is stored securely and cannot be exported. Make sure to backup your wallet password if using encrypted file storage.',
  };
}

export const createWalletTool = {
  name: 'create_wallet',
  description:
    'Create a new wallet with a randomly generated private key. The key is stored securely and never exposed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'A unique name for this wallet (alphanumeric, underscores, dashes)',
        minLength: 1,
        maxLength: 32,
      },
      network: {
        type: 'string',
        enum: ['mainnet', 'testnet'],
        default: 'mainnet',
        description: 'The network this wallet is for',
      },
    },
    required: ['name'],
  },
  handler: createWalletHandler,
};

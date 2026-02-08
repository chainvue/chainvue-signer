/**
 * MCP Tool: list_wallets
 *
 * Lists all wallets stored in the signer
 */

import { z } from 'zod';
import { listWallets } from '../wallet/index.js';

export const listWalletsSchema = z.object({});

export type ListWalletsInput = z.infer<typeof listWalletsSchema>;

export async function listWalletsHandler(_input: ListWalletsInput) {
  const wallets = await listWallets();

  return {
    wallets: wallets.map((w) => ({
      name: w.name,
      address: w.address,
      network: w.network,
      createdAt: w.createdAt,
    })),
    count: wallets.length,
  };
}

export const listWalletsTool = {
  name: 'list_wallets',
  description: 'List all wallets stored in the local signer. Returns wallet names, addresses, and networks. Private keys are never exposed.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  handler: listWalletsHandler,
};

/**
 * MCP Tool: get_address
 *
 * Gets the address for a stored wallet
 */

import { z } from 'zod';
import { getWallet } from '../wallet/index.js';

export const getAddressSchema = z.object({
  wallet: z.string().min(1).max(32),
});

export type GetAddressInput = z.infer<typeof getAddressSchema>;

export async function getAddressHandler(input: GetAddressInput) {
  const wallet = await getWallet(input.wallet);

  if (!wallet) {
    throw new Error(`Wallet "${input.wallet}" not found`);
  }

  return {
    name: wallet.name,
    address: wallet.address,
    network: wallet.network,
  };
}

export const getAddressTool = {
  name: 'get_address',
  description: 'Get the address for a stored wallet. Use this address to receive funds or check balance via ChainVue API.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      wallet: {
        type: 'string',
        description: 'The name of the wallet',
      },
    },
    required: ['wallet'],
  },
  handler: getAddressHandler,
};

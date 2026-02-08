/**
 * MCP Tool: delete_wallet
 *
 * Deletes a wallet from secure storage
 */

import { z } from 'zod';
import { deleteWallet } from '../wallet/index.js';

export const deleteWalletSchema = z.object({
  name: z.string().min(1).max(32),
  confirm: z.literal(true),
});

export type DeleteWalletInput = z.infer<typeof deleteWalletSchema>;

export async function deleteWalletHandler(input: DeleteWalletInput) {
  if (!input.confirm) {
    throw new Error('Deletion must be confirmed by setting confirm: true');
  }

  const deleted = await deleteWallet(input.name);

  return {
    success: deleted,
    message: deleted
      ? `Wallet "${input.name}" deleted successfully`
      : `Wallet "${input.name}" was not found`,
  };
}

export const deleteWalletTool = {
  name: 'delete_wallet',
  description:
    'Delete a wallet from secure storage. This action is irreversible - the private key will be permanently removed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: {
        type: 'string',
        description: 'The name of the wallet to delete',
      },
      confirm: {
        type: 'boolean',
        description: 'Must be set to true to confirm deletion',
        const: true,
      },
    },
    required: ['name', 'confirm'],
  },
  handler: deleteWalletHandler,
};

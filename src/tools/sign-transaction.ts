/**
 * MCP Tool: sign_transaction
 *
 * Signs a raw transaction using a stored wallet
 */

import { z } from 'zod';
import { signWithWallet } from '../wallet/index.js';

export const signTransactionSchema = z.object({
  wallet: z.string().min(1).max(32),
  unsigned_tx: z.string().min(10),
  inputs: z.array(
    z.object({
      txid: z.string().length(64),
      vout: z.number().int().min(0),
      scriptPubKey: z.string().min(2),
      amount: z.number().positive(),
    })
  ),
});

export type SignTransactionInput = z.infer<typeof signTransactionSchema>;

export async function signTransactionHandler(input: SignTransactionInput) {
  const result = await signWithWallet(
    input.wallet,
    input.unsigned_tx,
    input.inputs.map((i) => ({
      scriptPubKey: i.scriptPubKey,
      amount: i.amount,
    }))
  );

  return {
    success: true,
    signed_tx: result.signedTx,
    txid: result.txid,
    message: `Transaction signed successfully. TXID: ${result.txid}`,
  };
}

export const signTransactionTool = {
  name: 'sign_transaction',
  description:
    'Sign an unsigned transaction using a stored wallet. Requires the unsigned transaction hex and input details (for signature hash calculation). The private key never leaves this local signer.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      wallet: {
        type: 'string',
        description: 'The name of the wallet to sign with',
      },
      unsigned_tx: {
        type: 'string',
        description: 'The unsigned transaction in hex format (from build_unsigned_tx)',
      },
      inputs: {
        type: 'array',
        description: 'Details for each input being signed',
        items: {
          type: 'object',
          properties: {
            txid: {
              type: 'string',
              description: 'The transaction ID of the UTXO being spent',
            },
            vout: {
              type: 'number',
              description: 'The output index of the UTXO being spent',
            },
            scriptPubKey: {
              type: 'string',
              description: 'The scriptPubKey of the UTXO (hex)',
            },
            amount: {
              type: 'number',
              description: 'The amount in satoshis',
            },
          },
          required: ['txid', 'vout', 'scriptPubKey', 'amount'],
        },
      },
    },
    required: ['wallet', 'unsigned_tx', 'inputs'],
  },
  handler: signTransactionHandler,
};

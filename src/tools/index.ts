/**
 * MCP Tools registry
 */

export { listWalletsTool } from './list-wallets.js';
export { importKeyTool } from './import-key.js';
export { createWalletTool } from './create-wallet.js';
export { signTransactionTool } from './sign-transaction.js';
export { deleteWalletTool } from './delete-wallet.js';
export { getAddressTool } from './get-address.js';

import { listWalletsTool } from './list-wallets.js';
import { importKeyTool } from './import-key.js';
import { createWalletTool } from './create-wallet.js';
import { signTransactionTool } from './sign-transaction.js';
import { deleteWalletTool } from './delete-wallet.js';
import { getAddressTool } from './get-address.js';

export const allTools = [
  listWalletsTool,
  importKeyTool,
  createWalletTool,
  signTransactionTool,
  deleteWalletTool,
  getAddressTool,
];

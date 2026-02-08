#!/usr/bin/env node

/**
 * ChainVue Signer
 *
 * Local MCP server for secure Verus transaction signing.
 *
 * Usage:
 *   npx @chainvue/signer          # Start MCP server (stdio)
 *   npx @chainvue/signer --help   # Show help
 *
 * Configure in Claude Desktop or OpenClaw:
 * {
 *   "mcpServers": {
 *     "signer": {
 *       "command": "npx",
 *       "args": ["@chainvue/signer"]
 *     }
 *   }
 * }
 */

import { runServer } from './server.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
ChainVue Signer v1.0.0
======================

Local MCP server for secure Verus transaction signing.
Private keys are stored in OS keychain and never leave your machine.

USAGE:
  npx @chainvue/signer              Start MCP server (stdio mode)
  npx @chainvue/signer --help       Show this help message
  npx @chainvue/signer --version    Show version

CONFIGURATION:

  Add to your MCP client config (Claude Desktop, OpenClaw, etc.):

  {
    "mcpServers": {
      "signer": {
        "command": "npx",
        "args": ["@chainvue/signer"]
      }
    }
  }

ENVIRONMENT:

  CHAINVUE_SIGNER_PASSWORD    Password for encrypted file storage
                              (only needed on headless Linux systems)

TOOLS PROVIDED:

  list_wallets          List all stored wallets
  create_wallet         Create a new wallet with generated key
  import_key            Import a private key (WIF format)
  get_address           Get the address for a wallet
  sign_transaction      Sign a transaction
  delete_wallet         Delete a wallet from storage

SECURITY:

  - Private keys are stored in OS keychain (macOS/Windows/Linux desktop)
  - Falls back to encrypted file storage on headless systems
  - Keys never leave this local process
  - No network access required for signing

MORE INFO:

  https://chainvue.io/docs/signer
  https://github.com/chainvue/chainvue-signer
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  console.log('1.0.0');
  process.exit(0);
}

// Run the MCP server
runServer().catch((error) => {
  console.error('[ChainVue Signer] Fatal error:', error);
  process.exit(1);
});

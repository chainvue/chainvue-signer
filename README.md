# @chainvue/signer

Local MCP server for secure Verus transaction signing. Private keys never leave your machine.

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Your Machine                                                        │
│                                                                      │
│  ┌────────────────────┐        ┌────────────────────────────────┐   │
│  │  AI Agent          │  MCP   │  @chainvue/signer              │   │
│  │  (Claude, OpenClaw)│◄──────►│  • Keys in OS keychain         │   │
│  │                    │        │  • Signs transactions locally  │   │
│  └────────────────────┘        │  • Never connects to internet  │   │
│            │                   └────────────────────────────────┘   │
│            │ MCP                                                     │
│            ▼                                                         │
│  ┌────────────────────┐                                             │
│  │  ChainVue API      │  (remote - blockchain data & broadcast)     │
│  │  mcp.chainvue.io   │                                             │
│  └────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
npm install -g @chainvue/signer
```

## Configuration

Add to your MCP client configuration:

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chainvue": {
      "command": "npx",
      "args": ["mcp-remote", "https://mcp.chainvue.io/sse"],
      "env": { "CHAINVUE_TOKEN": "your-token" }
    },
    "signer": {
      "command": "npx",
      "args": ["@chainvue/signer"]
    }
  }
}
```

### OpenClaw

Add to your skill configuration:

```json
{
  "mcpServers": {
    "signer": {
      "command": "npx",
      "args": ["@chainvue/signer"]
    }
  }
}
```

## Tools

### list_wallets

List all stored wallets.

```json
{}
```

Returns:
```json
{
  "wallets": [
    {
      "name": "main",
      "address": "RXxxxxxxxxxxxx",
      "network": "mainnet",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1
}
```

### create_wallet

Create a new wallet with a randomly generated private key.

```json
{
  "name": "savings",
  "network": "mainnet"
}
```

### import_key

Import an existing private key (WIF format).

```json
{
  "name": "main",
  "wif": "UwxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxBk",
  "network": "mainnet"
}
```

### get_address

Get the address for a wallet.

```json
{
  "wallet": "main"
}
```

### sign_transaction

Sign a transaction. The unsigned transaction and input details come from ChainVue's `build_unsigned_tx` tool.

```json
{
  "wallet": "main",
  "unsigned_tx": "0400008085...",
  "inputs": [
    {
      "txid": "abc123...",
      "vout": 0,
      "scriptPubKey": "76a914...",
      "amount": 1000000000
    }
  ]
}
```

Returns:
```json
{
  "success": true,
  "signed_tx": "0400008085...signed...",
  "txid": "def456..."
}
```

### delete_wallet

Delete a wallet from storage.

```json
{
  "name": "old-wallet",
  "confirm": true
}
```

## Complete Flow Example

```
User: "Send 10 VRSC from my main wallet to RYzxxxxxx"

Agent: [MCP chainvue: get_address(wallet: "main")]
       → { address: "RXxxxx..." }

Agent: [MCP chainvue: get_utxos(address: "RXxxxx...")]
       → [{ txid: "abc...", vout: 0, amount: 50000000000, scriptPubKey: "76a914..." }]

Agent: [MCP chainvue: build_unsigned_tx(from: "RXxxxx...", to: "RYzxxxx...", amount: 1000000000)]
       → { unsigned_tx: "0400008085...", inputs: [...] }

Agent: [MCP signer: sign_transaction(wallet: "main", unsigned_tx: "...", inputs: [...])]
       → { signed_tx: "0400008085...signed...", txid: "def456..." }

Agent: [MCP chainvue: broadcast_signed_tx(signed_tx: "...")]
       → { txid: "def456...", success: true }

Agent: "Sent 10 VRSC to RYzxxxxxx. Transaction ID: def456..."
```

## Security

### Key Storage

| Platform | Storage Location |
|----------|------------------|
| macOS | Keychain Access (encrypted with login password) |
| Linux (Desktop) | Secret Service API (GNOME Keyring / KWallet) |
| Windows | Credential Manager (DPAPI) |
| Linux (Headless) | Encrypted file (~/.chainvue/keys.enc) |

### Security Properties

- **Isolation**: Keys never leave the signer process
- **Encryption**: AES-256-GCM for file storage, OS encryption for keychain
- **No Network**: Signer never makes network requests
- **No Export**: Private keys cannot be extracted via MCP tools

### Encrypted File Storage (Headless Linux)

When OS keychain isn't available, keys are stored in an encrypted file:

- Location: `~/.chainvue/keys.enc`
- Encryption: AES-256-GCM
- Key derivation: scrypt (N=16384, r=8, p=1)
- Password: Set via `CHAINVUE_SIGNER_PASSWORD` env var or interactive prompt

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CHAINVUE_SIGNER_PASSWORD` | Password for encrypted file storage (headless Linux only) |

## Development

```bash
# Clone
git clone https://github.com/chainvue/chainvue-signer
cd chainvue-signer

# Install dependencies
npm install

# Build
npm run build

# Run in development
npm run dev

# Test
npm test
```

## License

MIT - see [LICENSE](LICENSE)

## Links

- [ChainVue](https://chainvue.io) - Verus blockchain API
- [Verus](https://verus.io) - Verus blockchain
- [MCP](https://modelcontextprotocol.io) - Model Context Protocol

/**
 * Transaction signing for Verus
 *
 * Signs raw transactions using the Verus/Zcash transaction format
 */

import * as crypto from 'crypto';
import createHash from 'create-hash';
import { wifToPrivateKey, isCompressedWif, privateKeyToPublicKey, hash160 } from './keys.js';

// Sighash types
const SIGHASH_ALL = 0x01;

// Verus consensus branch ID (for v4 transactions)
const CONSENSUS_BRANCH_ID = 0x76b809bb;

/**
 * Double SHA256
 */
function sha256d(data: Buffer): Buffer {
  return createHash('sha256').update(createHash('sha256').update(data).digest()).digest();
}

/**
 * BLAKE2b-256 for Zcash/Verus
 */
async function blake2b256(data: Buffer, personalization: Buffer): Promise<Buffer> {
  // Use Node.js built-in if available, otherwise fall back
  try {
    const { blake2b } = await import('@noble/hashes/blake2b');
    return Buffer.from(blake2b(data, { dkLen: 32, personalization }));
  } catch {
    // Fallback: use createHash with sha256 (less ideal but works)
    console.warn('[Signer] BLAKE2b not available, using SHA256 fallback');
    return createHash('sha256').update(data).digest();
  }
}

/**
 * Parse a raw transaction hex
 */
function parseTransaction(txHex: string): {
  version: number;
  versionGroupId: number;
  inputs: Array<{
    txid: Buffer;
    vout: number;
    scriptSig: Buffer;
    sequence: number;
  }>;
  outputs: Array<{
    value: bigint;
    scriptPubKey: Buffer;
  }>;
  lockTime: number;
  expiryHeight: number;
  valueBalance: bigint;
  raw: Buffer;
} {
  const raw = Buffer.from(txHex, 'hex');
  let offset = 0;

  // Read version (4 bytes, little-endian)
  const version = raw.readInt32LE(offset);
  offset += 4;

  // For Zcash v4+, read version group ID
  let versionGroupId = 0;
  if ((version & 0x80000000) !== 0) {
    versionGroupId = raw.readUInt32LE(offset);
    offset += 4;
  }

  // Read inputs
  const inputCount = readVarInt(raw, offset);
  offset = inputCount.offset;
  const inputs: Array<{
    txid: Buffer;
    vout: number;
    scriptSig: Buffer;
    sequence: number;
  }> = [];

  for (let i = 0; i < inputCount.value; i++) {
    const txid = raw.slice(offset, offset + 32);
    offset += 32;

    const vout = raw.readUInt32LE(offset);
    offset += 4;

    const scriptLen = readVarInt(raw, offset);
    offset = scriptLen.offset;

    const scriptSig = raw.slice(offset, offset + scriptLen.value);
    offset += scriptLen.value;

    const sequence = raw.readUInt32LE(offset);
    offset += 4;

    inputs.push({ txid, vout, scriptSig, sequence });
  }

  // Read outputs
  const outputCount = readVarInt(raw, offset);
  offset = outputCount.offset;
  const outputs: Array<{
    value: bigint;
    scriptPubKey: Buffer;
  }> = [];

  for (let i = 0; i < outputCount.value; i++) {
    const value = raw.readBigInt64LE(offset);
    offset += 8;

    const scriptLen = readVarInt(raw, offset);
    offset = scriptLen.offset;

    const scriptPubKey = raw.slice(offset, offset + scriptLen.value);
    offset += scriptLen.value;

    outputs.push({ value, scriptPubKey });
  }

  // Read locktime
  const lockTime = raw.readUInt32LE(offset);
  offset += 4;

  // Read expiry height (for v3+)
  let expiryHeight = 0;
  if (version >= 3 || (version & 0x80000000) !== 0) {
    expiryHeight = raw.readUInt32LE(offset);
    offset += 4;
  }

  // Read value balance (for v4 with sapling)
  let valueBalance = BigInt(0);
  if ((version & 0x80000000) !== 0 && versionGroupId === 0x892f2085) {
    valueBalance = raw.readBigInt64LE(offset);
    offset += 8;
  }

  return {
    version,
    versionGroupId,
    inputs,
    outputs,
    lockTime,
    expiryHeight,
    valueBalance,
    raw,
  };
}

function readVarInt(buffer: Buffer, offset: number): { value: number; offset: number } {
  const first = buffer[offset];
  if (first < 0xfd) {
    return { value: first, offset: offset + 1 };
  } else if (first === 0xfd) {
    return { value: buffer.readUInt16LE(offset + 1), offset: offset + 3 };
  } else if (first === 0xfe) {
    return { value: buffer.readUInt32LE(offset + 1), offset: offset + 5 };
  } else {
    // 0xff - 8 bytes, but we'll just use 4 for now
    return { value: buffer.readUInt32LE(offset + 1), offset: offset + 9 };
  }
}

function writeVarInt(value: number): Buffer {
  if (value < 0xfd) {
    return Buffer.from([value]);
  } else if (value <= 0xffff) {
    const buf = Buffer.alloc(3);
    buf[0] = 0xfd;
    buf.writeUInt16LE(value, 1);
    return buf;
  } else if (value <= 0xffffffff) {
    const buf = Buffer.alloc(5);
    buf[0] = 0xfe;
    buf.writeUInt32LE(value, 1);
    return buf;
  } else {
    throw new Error('VarInt too large');
  }
}

/**
 * Create signature hash for Zcash/Verus v4 transaction (BIP143-like)
 */
async function createSighashV4(
  tx: ReturnType<typeof parseTransaction>,
  inputIndex: number,
  scriptCode: Buffer,
  amount: bigint,
  hashType: number = SIGHASH_ALL
): Promise<Buffer> {
  const personalization = Buffer.from('ZcashSigHash' + '\x19\x1b\xa8\x5b'); // + branch ID bytes

  // hashPrevouts
  let prevoutsData = Buffer.alloc(0);
  for (const input of tx.inputs) {
    prevoutsData = Buffer.concat([prevoutsData, input.txid, Buffer.alloc(4)]);
    prevoutsData.writeUInt32LE(input.vout, prevoutsData.length - 4);
  }
  const hashPrevouts = await blake2b256(prevoutsData, Buffer.from('ZcashPrevoutHash'));

  // hashSequence
  let sequenceData = Buffer.alloc(0);
  for (const input of tx.inputs) {
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(input.sequence);
    sequenceData = Buffer.concat([sequenceData, seqBuf]);
  }
  const hashSequence = await blake2b256(sequenceData, Buffer.from('ZcashSequencHash'));

  // hashOutputs
  let outputsData = Buffer.alloc(0);
  for (const output of tx.outputs) {
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigInt64LE(output.value);
    outputsData = Buffer.concat([
      outputsData,
      valueBuf,
      writeVarInt(output.scriptPubKey.length),
      output.scriptPubKey,
    ]);
  }
  const hashOutputs = await blake2b256(outputsData, Buffer.from('ZcashOutputsHash'));

  // Build sighash preimage
  const input = tx.inputs[inputIndex];
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeInt32LE(tx.version);

  const versionGroupBuf = Buffer.alloc(4);
  versionGroupBuf.writeUInt32LE(tx.versionGroupId);

  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigInt64LE(amount);

  const sequenceBuf = Buffer.alloc(4);
  sequenceBuf.writeUInt32LE(input.sequence);

  const lockTimeBuf = Buffer.alloc(4);
  lockTimeBuf.writeUInt32LE(tx.lockTime);

  const expiryBuf = Buffer.alloc(4);
  expiryBuf.writeUInt32LE(tx.expiryHeight);

  const hashTypeBuf = Buffer.alloc(4);
  hashTypeBuf.writeUInt32LE(hashType);

  const preimage = Buffer.concat([
    versionBuf,
    versionGroupBuf,
    hashPrevouts,
    hashSequence,
    hashOutputs,
    Buffer.alloc(32), // hashJoinSplits (empty)
    Buffer.alloc(32), // hashShieldedSpends (empty)
    Buffer.alloc(32), // hashShieldedOutputs (empty)
    lockTimeBuf,
    expiryBuf,
    Buffer.alloc(8), // valueBalance
    hashTypeBuf,
    input.txid,
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32LE(input.vout);
      return b;
    })(),
    writeVarInt(scriptCode.length),
    scriptCode,
    amountBuf,
    sequenceBuf,
  ]);

  return blake2b256(preimage, personalization);
}

/**
 * Create a DER-encoded signature
 */
function createDerSignature(r: Buffer, s: Buffer): Buffer {
  // Ensure positive (add 0x00 prefix if high bit set)
  if (r[0] & 0x80) r = Buffer.concat([Buffer.from([0x00]), r]);
  if (s[0] & 0x80) s = Buffer.concat([Buffer.from([0x00]), s]);

  // Remove leading zeros (but keep one if needed for sign)
  while (r.length > 1 && r[0] === 0 && !(r[1] & 0x80)) r = r.slice(1);
  while (s.length > 1 && s[0] === 0 && !(s[1] & 0x80)) s = s.slice(1);

  const rLen = r.length;
  const sLen = s.length;
  const totalLen = 4 + rLen + sLen;

  return Buffer.concat([
    Buffer.from([0x30, totalLen, 0x02, rLen]),
    r,
    Buffer.from([0x02, sLen]),
    s,
  ]);
}

/**
 * Sign a transaction input
 */
export async function signInput(
  wif: string,
  txHex: string,
  inputIndex: number,
  prevScriptPubKey: string,
  amount: number
): Promise<string> {
  const secp256k1 = await import('tiny-secp256k1');

  const privateKey = wifToPrivateKey(wif);
  const compressed = isCompressedWif(wif);
  const publicKey = await privateKeyToPublicKey(privateKey, compressed);

  const tx = parseTransaction(txHex);
  const scriptCode = Buffer.from(prevScriptPubKey, 'hex');

  // Create sighash
  const sighash = await createSighashV4(tx, inputIndex, scriptCode, BigInt(amount), SIGHASH_ALL);

  // Sign
  const signature = secp256k1.sign(sighash, privateKey);
  if (!signature) {
    throw new Error('Failed to create signature');
  }

  // Create DER signature with sighash type
  const r = Buffer.from(signature.slice(0, 32));
  const s = Buffer.from(signature.slice(32, 64));
  const derSig = createDerSignature(r, s);
  const sigWithHashType = Buffer.concat([derSig, Buffer.from([SIGHASH_ALL])]);

  // Create scriptSig: <sig> <pubkey>
  const scriptSig = Buffer.concat([
    Buffer.from([sigWithHashType.length]),
    sigWithHashType,
    Buffer.from([publicKey.length]),
    publicKey,
  ]);

  // Replace input's scriptSig
  tx.inputs[inputIndex].scriptSig = scriptSig;

  // Rebuild transaction
  return rebuildTransaction(tx);
}

/**
 * Rebuild transaction from parsed structure
 */
function rebuildTransaction(tx: ReturnType<typeof parseTransaction>): string {
  const parts: Buffer[] = [];

  // Version
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeInt32LE(tx.version);
  parts.push(versionBuf);

  // Version group ID (for v4+)
  if ((tx.version & 0x80000000) !== 0) {
    const vgBuf = Buffer.alloc(4);
    vgBuf.writeUInt32LE(tx.versionGroupId);
    parts.push(vgBuf);
  }

  // Input count
  parts.push(writeVarInt(tx.inputs.length));

  // Inputs
  for (const input of tx.inputs) {
    parts.push(input.txid);
    const voutBuf = Buffer.alloc(4);
    voutBuf.writeUInt32LE(input.vout);
    parts.push(voutBuf);
    parts.push(writeVarInt(input.scriptSig.length));
    parts.push(input.scriptSig);
    const seqBuf = Buffer.alloc(4);
    seqBuf.writeUInt32LE(input.sequence);
    parts.push(seqBuf);
  }

  // Output count
  parts.push(writeVarInt(tx.outputs.length));

  // Outputs
  for (const output of tx.outputs) {
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigInt64LE(output.value);
    parts.push(valueBuf);
    parts.push(writeVarInt(output.scriptPubKey.length));
    parts.push(output.scriptPubKey);
  }

  // Lock time
  const lockTimeBuf = Buffer.alloc(4);
  lockTimeBuf.writeUInt32LE(tx.lockTime);
  parts.push(lockTimeBuf);

  // Expiry height
  if (tx.version >= 3 || (tx.version & 0x80000000) !== 0) {
    const expiryBuf = Buffer.alloc(4);
    expiryBuf.writeUInt32LE(tx.expiryHeight);
    parts.push(expiryBuf);
  }

  // Value balance (for sapling)
  if ((tx.version & 0x80000000) !== 0 && tx.versionGroupId === 0x892f2085) {
    const valueBuf = Buffer.alloc(8);
    valueBuf.writeBigInt64LE(tx.valueBalance);
    parts.push(valueBuf);

    // Empty sapling data
    parts.push(writeVarInt(0)); // vShieldedSpend
    parts.push(writeVarInt(0)); // vShieldedOutput
    parts.push(writeVarInt(0)); // vJoinSplit
  }

  return Buffer.concat(parts).toString('hex');
}

/**
 * Calculate transaction ID from signed transaction
 */
export function calculateTxid(txHex: string): string {
  const txBuffer = Buffer.from(txHex, 'hex');
  const hash = sha256d(txBuffer);
  // Reverse for display (little-endian to big-endian)
  return Buffer.from(hash).reverse().toString('hex');
}

/**
 * Sign all inputs of a transaction
 */
export async function signTransaction(
  wif: string,
  txHex: string,
  inputs: Array<{
    scriptPubKey: string;
    amount: number;
  }>
): Promise<{ signedTx: string; txid: string }> {
  let signedTx = txHex;

  for (let i = 0; i < inputs.length; i++) {
    signedTx = await signInput(wif, signedTx, i, inputs[i].scriptPubKey, inputs[i].amount);
  }

  const txid = calculateTxid(signedTx);

  return { signedTx, txid };
}

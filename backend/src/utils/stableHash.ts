// backend/src/utils/stableHash.ts
import crypto from 'crypto';
import { GraphTopology } from '../types/graph';

/**
 * Recursively sorts object keys to ensure deterministic stringification.
 * In JavaScript, object key order is not guaranteed. This function ensures 
 * that { a: 1, b: 2 } and { b: 2, a: 1 } produce the exact same string,
 * which is critical for generating consistent hashes.
 */
const stringifyDeterministic = (obj: any): string => {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const arr = obj.map((item) => stringifyDeterministic(item));
    return `[${arr.join(',')}]`;
  }

  // Extract, sort, and process object keys deterministically
  const sortedKeys = Object.keys(obj).sort();
  const keyValPairs = sortedKeys.map(
    (key) => `"${key}":${stringifyDeterministic(obj[key])}`
  );
  
  return `{${keyValPairs.join(',')}}`;
};

/**
 * Generates a stable SHA-256 hash from the architecture graph.
 * * * Why this matters for InfraZero:
 * The Rust WASM simulation engine requires strictly deterministic inputs. 
 * By hashing the graph topology on the backend, you can verify state integrity, 
 * prevent malicious payload tampering before saving to Supabase, and effectively 
 * cache simulation results for identical architectures.
 */
export const generateStableHash = (data: GraphTopology | any): string => {
  const stableString = stringifyDeterministic(data);
  
  return crypto
    .createHash('sha256')
    .update(stableString)
    .digest('hex');
};
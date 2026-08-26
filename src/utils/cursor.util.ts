/**
 * Utility functions for Base64 encoding and decoding cursors used in seek-based pagination.
 */

export interface CursorPayload {
  id: string;
  [key: string]: any;
}

/**
 * Encodes a JSON object payload into a Base64 string.
 */
export const encodeCursor = (payload: CursorPayload): string => {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
};

/**
 * Decodes a Base64 cursor string back into a JSON object payload.
 */
export const decodeCursor = <T = CursorPayload>(cursor: string): T | null => {
  try {
    const decodedJson = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(decodedJson) as T;
  } catch (error) {
    return null;
  }
};
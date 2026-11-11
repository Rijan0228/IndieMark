
/*
 * IndieMark Watermark Core
 * Version: 1.0.0
 *
 * Shared payload and validation utilities.
 *
 * IMPORTANT:
 * This file does not embed or recover watermarks.
 * It prepares and validates watermark payload data
 * for future media-engine implementations.
 */

(function (root) {
  "use strict";

  const VERSION = 1;
  const PREFIX = "INDIEMARK";

  const MAX_ID_LENGTH = 64;
  const MAX_LABEL_LENGTH = 120;

  const encoder = new TextEncoder();
  const decoder = new TextDecoder("utf-8", {
    fatal: true
  });

  /*
   * Generate a random identifier.
   */

  function createId() {
    if (!root.crypto || !root.crypto.getRandomValues) {
      throw new Error(
        "Secure random number generation is unavailable."
      );
    }

    const bytes = new Uint8Array(12);

    root.crypto.getRandomValues(bytes);

    const value = Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    return "IM-" + value;
  }

  /*
   * Normalize and validate a distribution ID.
   */

  function validateId(id) {
    if (typeof id !== "string") {
      return false;
    }

    if (id.length > MAX_ID_LENGTH) {
      return false;
    }

    return /^IM-[A-F0-9-]+$/i.test(id);
  }

  /*
   * Calculate CRC32.
   *
   * This detects accidental data corruption.
   * It is NOT a cryptographic signature.
   */

  function crc32(data) {
    let crc = 0xFFFFFFFF;

    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];

      for (let j = 0; j < 8; j++) {
        const mask = -(crc & 1);

        crc = (crc >>> 1) ^ (
          0xEDB88320 & mask
        );
      }
    }

    return ((crc ^ 0xFFFFFFFF) >>> 0)
      .toString(16)
      .padStart(8, "0")
      .toUpperCase();
  }

  /*
   * Create a standard watermark payload.
   */

  function createPayload(options = {}) {
    const id = options.id || createId();

    if (!validateId(id)) {
      throw new Error("Invalid distribution ID.");
    }

    const label = String(options.label || "")
      .trim()
      .slice(0, MAX_LABEL_LENGTH);

    const createdAt = options.createdAt || new Date().toISOString();

    if (Number.isNaN(Date.parse(createdAt))) {
      throw new Error("Invalid creation date.");
    }

    return {
      prefix: PREFIX,
      version: VERSION,
      id,
      label,
      createdAt
    };
  }

  /*
   * Serialize payload into UTF-8 bytes.
   *
   * Format:
   * PREFIX|VERSION|ID|LABEL|DATE
   */

  function serialize(payload) {
    if (!validatePayload(payload)) {
      throw new Error("Invalid watermark payload.");
    }

    const fields = [
      PREFIX,
      String(VERSION),
      payload.id,
      encodeURIComponent(payload.label),
      payload.createdAt
    ];

    const body = fields.join("|");

    const bodyBytes = encoder.encode(body);

    const checksum = crc32(bodyBytes);

    const complete = body + "|" + checksum;

    return encoder.encode(complete);
  }

  /*
   * Read and validate serialized payload bytes.
   */

  function deserialize(input) {
    try {
      const bytes = input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

      const text = decoder.decode(bytes);

      const fields = text.split("|");

      if (fields.length !== 6) {
        return {
          valid: false,
          reason: "Invalid payload structure."
        };
      }

      const [
        prefix,
        version,
        id,
        encodedLabel,
        createdAt,
        suppliedChecksum
      ] = fields;

      if (prefix !== PREFIX) {
        return {
          valid: false,
          reason: "Unknown payload prefix."
        };
      }

      if (Number(version) !== VERSION) {
        return {
          valid: false,
          reason: "Unsupported payload version."
        };
      }

      if (!validateId(id)) {
        return {
          valid: false,
          reason: "Invalid distribution ID."
        };
      }

      const label = decodeURIComponent(encodedLabel);

      if (label.length > MAX_LABEL_LENGTH) {
        return {
          valid: false,
          reason: "Label is too long."
        };
      }

      if (Number.isNaN(Date.parse(createdAt))) {
        return {
          valid: false,
          reason: "Invalid creation date."
        };
      }

      const body = fields.slice(0, 5).join("|");

      const expectedChecksum = crc32(
        encoder.encode(body)
      );

      if (expectedChecksum !== suppliedChecksum) {
        return {
          valid: false,
          reason: "Checksum verification failed."
        };
      }

      return {
        valid: true,

        payload: {
          prefix,
          version: Number(version),
          id,
          label,
          createdAt
        }
      };

    } catch (error) {
      return {
        valid: false,
        reason: "Payload could not be decoded."
      };
    }
  }

  /*
   * Validate a JavaScript payload object.
   */

  function validatePayload(payload) {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (payload.prefix !== PREFIX) {
      return false;
    }

    if (payload.version !== VERSION) {
      return false;
    }

    if (!validateId(payload.id)) {
      return false;
    }

    if (typeof payload.label !== "string") {
      return false;
    }

    if (payload.label.length > MAX_LABEL_LENGTH) {
      return false;
    }

    if (
      typeof payload.createdAt !== "string" ||
      Number.isNaN(Date.parse(payload.createdAt))
    ) {
      return false;
    }

    return true;
  }

  /*
   * Convert bytes to hexadecimal.
   */

  function toHex(input) {
    const bytes = input instanceof Uint8Array
      ? input
      : new Uint8Array(input);

    return Array.from(bytes)
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /*
   * Convert hexadecimal into bytes.
   */

  function fromHex(hex) {
    if (
      typeof hex !== "string" ||
      hex.length % 2 !== 0 ||
      !/^[0-9a-f]*$/i.test(hex)
    ) {
      throw new Error("Invalid hexadecimal input.");
    }

    const output = new Uint8Array(hex.length / 2);

    for (let i = 0; i < output.length; i++) {
      output[i] = parseInt(
        hex.slice(i * 2, i * 2 + 2),
        16
      );
    }

    return output;
  }

  /*
   * Public API
   */

  const WatermarkCore = Object.freeze({
    version: VERSION,
    prefix: PREFIX,

    createId,
    validateId,

    createPayload,
    validatePayload,

    serialize,
    deserialize,

    crc32,
    toHex,
    fromHex
  });

  /*
   * Expose to browser scripts.
   */

  root.IndieMark = root.IndieMark || {};

  root.IndieMark.WatermarkCore = WatermarkCore;

})(globalThis);

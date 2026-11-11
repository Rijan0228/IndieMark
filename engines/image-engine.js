
/*
 * IndieMark Image Engine
 * Version: 1.0.0
 *
 * Experimental PNG watermark engine.
 *
 * Uses repeated least-significant-bit encoding.
 *
 * IMPORTANT:
 * This is a prototype, not a robust or secure
 * invisible watermarking system.
 *
 * It may fail after resizing, cropping, screenshots,
 * colour changes or lossy compression.
 */

(function (root) {
  "use strict";

  const MAGIC = [0x49, 0x4D, 0x57, 0x4D]; // IMWM

  const VERSION = 1;

  const REPETITIONS = 5;

  const MAX_PAYLOAD_SIZE = 4096;

  const MAX_IMAGE_PIXELS = 40000000;

  const HEADER_SIZE = 8;

  const CORE = () =>
    root.IndieMark?.WatermarkCore;

  /*
   * Convert a number into four big-endian bytes.
   */

  function numberToBytes(value) {
    return [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255
    ];
  }

  /*
   * Convert four big-endian bytes into a number.
   */

  function bytesToNumber(bytes) {
    return (
      bytes[0] * 16777216 +
      bytes[1] * 65536 +
      bytes[2] * 256 +
      bytes[3]
    );
  }

  /*
   * Convert bytes into a sequence of bits.
   * Most significant bit first.
   */

  function bytesToBits(bytes) {
    const bits = [];

    for (const byte of bytes) {
      for (let bit = 7; bit >= 0; bit--) {
        bits.push((byte >> bit) & 1);
      }
    }

    return bits;
  }

  /*
   * Convert bits into bytes.
   */

  function bitsToBytes(bits) {
    if (bits.length % 8 !== 0) {
      throw new Error("Invalid bit sequence.");
    }

    const output = new Uint8Array(bits.length / 8);

    for (let i = 0; i < output.length; i++) {
      let value = 0;

      for (let bit = 0; bit < 8; bit++) {
        value = (value << 1) | bits[i * 8 + bit];
      }

      output[i] = value;
    }

    return output;
  }

  /*
   * Repeat every bit to improve resistance to
   * occasional individual bit errors.
   */

  function repeatBits(bits) {
    const output = [];

    for (const bit of bits) {
      for (let i = 0; i < REPETITIONS; i++) {
        output.push(bit);
      }
    }

    return output;
  }

  /*
   * Majority vote to recover repeated bits.
   */

  function recoverRepeatedBits(bits) {
    if (bits.length % REPETITIONS !== 0) {
      throw new Error("Invalid repeated bit sequence.");
    }

    const output = [];

    for (let i = 0; i < bits.length; i += REPETITIONS) {
      let ones = 0;

      for (let j = 0; j < REPETITIONS; j++) {
        ones += bits[i + j];
      }

      output.push(
        ones > REPETITIONS / 2 ? 1 : 0
      );
    }

    return output;
  }

  /*
   * Prepare an image for Canvas processing.
   */

  async function loadImage(file) {
    if (!(file instanceof Blob)) {
      throw new Error("A valid image file is required.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("The selected file is not an image.");
    }

    if (typeof createImageBitmap !== "function") {
      throw new Error(
        "This browser does not support image decoding."
      );
    }

    const bitmap = await createImageBitmap(file);

    const width = bitmap.width;
    const height = bitmap.height;

    if (!width || !height) {
      bitmap.close();

      throw new Error("Image dimensions are invalid.");
    }

    if (width * height > MAX_IMAGE_PIXELS) {
      bitmap.close();

      throw new Error(
        "Image is too large for this prototype."
      );
    }

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });

    if (!context) {
      bitmap.close();

      throw new Error("Canvas is unavailable.");
    }

    context.drawImage(bitmap, 0, 0);

    bitmap.close();

    return {
      canvas,
      context,
      width,
      height
    };
  }

  /*
   * Read the RGB colour channels.
   *
   * Alpha is intentionally excluded.
   */

  /*
   * Create the binary image watermark packet.
   *
   * Structure:
   * 4 bytes magic
   * 4 bytes payload length
   * N bytes serialized payload
   */

  function createPacket(payloadBytes) {
    const length = payloadBytes.length;

    if (length > MAX_PAYLOAD_SIZE) {
      throw new Error("Watermark payload is too large.");
    }

    const packet = new Uint8Array(
      HEADER_SIZE + length
    );

    packet.set(MAGIC, 0);

    packet.set(
      numberToBytes(length),
      4
    );

    packet.set(payloadBytes, HEADER_SIZE);

    return packet;
  }

  /*
   * Embed a payload into an image.
   *
   * Returns a PNG Blob.
   */

  async function embed(file, payload) {
    const core = CORE();

    if (!core) {
      throw new Error(
        "WatermarkCore is not loaded. Load watermark-core.js first."
      );
    }

    if (!core.validatePayload(payload)) {
      throw new Error("Invalid watermark payload.");
    }

    const payloadBytes = core.serialize(payload);

    const packet = createPacket(payloadBytes);

    const packetBits = repeatBits(
      bytesToBits(packet)
    );

    const {
      canvas,
      context,
      width,
      height
    } = await loadImage(file);

    const imageData = context.getImageData(
      0,
      0,
      width,
      height
    );

    const availableChannels = (imageData.data.length / 4) * 3;

    if (packetBits.length > availableChannels) {
      throw new Error(
        "Image does not have enough capacity for this watermark. Use a larger image."
      );
    }

    for (let i = 0; i < packetBits.length; i++) {
      const channelIndex = Math.floor(i / 3) * 4 + (i % 3);

      const current = imageData.data[channelIndex];

      imageData.data[channelIndex] =
        (current & 254) | packetBits[i];
    }

    context.putImageData(imageData, 0, 0);

    const output = await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error("Could not export the watermarked PNG.")
            );
          }
        },
        "image/png"
      );
    });

    return {
      blob: output,
      mimeType: "image/png",
      width,
      height,
      distributionId: payload.id,
      watermarkBytes: packet.length,
      repetitionFactor: REPETITIONS,
      method: "experimental-lsb"
    };
  }

  /*
   * Read a repeated-bit packet from an image.
   */

  async function readPacket(imageData, byteLength) {
    const availableChannels = (imageData.data.length / 4) * 3;
    const requiredBits = byteLength * 8 * REPETITIONS;

    if (requiredBits > availableChannels) {
      throw new Error("Image is too small.");
    }

    const repeated = [];

    for (let i = 0; i < requiredBits; i++) {
      const channelIndex = Math.floor(i / 3) * 4 + (i % 3);

      repeated.push(
        imageData.data[channelIndex] & 1
      );
    }

    return bitsToBytes(
      recoverRepeatedBits(repeated)
    );
  }

  /*
   * Attempt to extract a watermark from an image.
   *
   * Only detects this prototype's exact packet format.
   */

  async function extract(file) {
    const core = CORE();

    if (!core) {
      throw new Error(
        "WatermarkCore is not loaded. Load watermark-core.js first."
      );
    }

    const {
      context,
      width,
      height
    } = await loadImage(file);

    const imageData = context.getImageData(
      0,
      0,
      width,
      height
    );

    const minimumHeaderBytes = HEADER_SIZE;

    const header = await readPacket(
      imageData,
      minimumHeaderBytes
    );

    for (let i = 0; i < MAGIC.length; i++) {
      if (header[i] !== MAGIC[i]) {
        return {
          found: false,
          reason: "No compatible watermark was detected."
        };
      }
    }

    const payloadLength = bytesToNumber([
      header[4],
      header[5],
      header[6],
      header[7]
    ]);

    if (
      payloadLength < 1 ||
      payloadLength > MAX_PAYLOAD_SIZE
    ) {
      return {
        found: false,
        reason: "Invalid watermark payload length."
      };
    }

    const completePacket = await readPacket(
      imageData,
      HEADER_SIZE + payloadLength
    );

    const payloadBytes = completePacket.slice(
      HEADER_SIZE
    );

    const result = core.deserialize(payloadBytes);

    if (!result.valid) {
      return {
        found: false,
        reason: result.reason
      };
    }

    return {
      found: true,
      payload: result.payload,
      method: "experimental-lsb",
      verified: true,
      note:
        "The payload checksum is valid. This does not prove who created or embedded the image."
    };
  }

  /*
   * Public API
   */

  const ImageEngine = Object.freeze({
    version: VERSION,

    method: "experimental-lsb",

    embed,
    extract
  });

  root.IndieMark = root.IndieMark || {};

  root.IndieMark.ImageEngine = ImageEngine;

})(globalThis);

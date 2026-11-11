/*
 * IndieMark Audio Engine
 * Version: 1.0.0
 *
 * Experimental PCM WAV watermark engine.
 *
 * Stores a repeated payload in the least significant bit
 * of 16-bit PCM audio samples.
 *
 * IMPORTANT:
 * - Supports uncompressed PCM WAV with 16-bit samples only.
 * - Exports WAV audio.
 * - Re-encoding, MP3/AAC compression, resampling, trimming,
 *   noise reduction and many edits may destroy the watermark.
 * - This is not cryptographic authentication or proof of ownership.
 */

(function (root) {
  "use strict";

  const MAGIC = [0x49, 0x4D, 0x57, 0x41]; // IMWA
  const VERSION = 1;
  const REPETITIONS = 5;
  const MAX_PAYLOAD_SIZE = 4096;
  const HEADER_SIZE = 8;

  const CORE = () => root.IndieMark?.WatermarkCore;

  function numberToBytes(value) {
    return [
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255
    ];
  }

  function bytesToNumber(bytes) {
    return (
      bytes[0] * 16777216 +
      bytes[1] * 65536 +
      bytes[2] * 256 +
      bytes[3]
    );
  }

  function bytesToBits(bytes) {
    const bits = [];

    for (const byte of bytes) {
      for (let bit = 7; bit >= 0; bit--) {
        bits.push((byte >> bit) & 1);
      }
    }

    return bits;
  }

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

  function repeatBits(bits) {
    const output = [];

    for (const bit of bits) {
      for (let i = 0; i < REPETITIONS; i++) {
        output.push(bit);
      }
    }

    return output;
  }

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

      output.push(ones > REPETITIONS / 2 ? 1 : 0);
    }

    return output;
  }

  function readAscii(bytes, offset, length) {
    let value = "";

    for (let i = 0; i < length; i++) {
      value += String.fromCharCode(bytes[offset + i]);
    }

    return value;
  }

  /*
   * Parse the RIFF/WAVE container and locate its PCM data chunk.
   * Chunk ordering and optional chunks are supported.
   */

  function parseWav(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 44) {
      throw new Error("The selected file is too small to be a WAV file.");
    }

    if (
      readAscii(bytes, 0, 4) !== "RIFF" ||
      readAscii(bytes, 8, 4) !== "WAVE"
    ) {
      throw new Error("Invalid RIFF/WAVE file.");
    }

    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength
    );

    let format = null;
    let dataOffset = -1;
    let dataSize = 0;

    let offset = 12;

    while (offset + 8 <= bytes.length) {
      const chunkId = readAscii(bytes, offset, 4);
      const chunkSize = view.getUint32(offset + 4, true);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkSize;

      if (chunkEnd > bytes.length) {
        throw new Error("WAV file contains an incomplete chunk.");
      }

      if (chunkId === "fmt ") {
        if (chunkSize < 16) {
          throw new Error("Invalid WAV format chunk.");
        }

        format = {
          audioFormat: view.getUint16(chunkStart, true),
          channels: view.getUint16(chunkStart + 2, true),
          sampleRate: view.getUint32(chunkStart + 4, true),
          byteRate: view.getUint32(chunkStart + 8, true),
          blockAlign: view.getUint16(chunkStart + 12, true),
          bitsPerSample: view.getUint16(chunkStart + 14, true)
        };
      }

      if (chunkId === "data" && dataOffset === -1) {
        dataOffset = chunkStart;
        dataSize = chunkSize;
      }

      offset = chunkEnd + (chunkSize % 2);
    }

    if (!format || dataOffset < 0) {
      throw new Error("WAV format or audio data chunk was not found.");
    }

    if (format.audioFormat !== 1 || format.bitsPerSample !== 16) {
      throw new Error(
        "Only uncompressed 16-bit PCM WAV audio is supported."
      );
    }

    if (
      !format.channels ||
      !format.sampleRate ||
      format.blockAlign !== format.channels * 2 ||
      dataSize % format.blockAlign !== 0
    ) {
      throw new Error("Unsupported or inconsistent PCM WAV format.");
    }

    return {
      dataOffset,
      dataSize,
      sampleCount: dataSize / 2,
      channels: format.channels,
      sampleRate: format.sampleRate,
      bitsPerSample: format.bitsPerSample
    };
  }

  function createPacket(payloadBytes) {
    if (payloadBytes.length > MAX_PAYLOAD_SIZE) {
      throw new Error("Watermark payload is too large.");
    }

    const packet = new Uint8Array(HEADER_SIZE + payloadBytes.length);

    packet.set(MAGIC, 0);
    packet.set(numberToBytes(payloadBytes.length), 4);
    packet.set(payloadBytes, HEADER_SIZE);

    return packet;
  }

  function readRepeatedPacket(bytes, wav, byteLength) {
    const requiredBits = byteLength * 8 * REPETITIONS;

    if (requiredBits > wav.sampleCount) {
      throw new Error("Audio does not contain enough samples.");
    }

    const repeated = [];

    for (let i = 0; i < requiredBits; i++) {
      const sampleByteOffset = wav.dataOffset + (i * 2);

      repeated.push(bytes[sampleByteOffset] & 1);
    }

    return bitsToBytes(recoverRepeatedBits(repeated));
  }

  /*
   * Embed a payload into a 16-bit PCM WAV file.
   * The original input file is never modified.
   */

  async function embed(file, payload) {
    const core = CORE();

    if (!core) {
      throw new Error(
        "WatermarkCore is not loaded. Load watermark-core.js first."
      );
    }

    if (!(file instanceof Blob)) {
      throw new Error("A valid audio file is required.");
    }

    if (!core.validatePayload(payload)) {
      throw new Error("Invalid watermark payload.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const wav = parseWav(bytes);
    const payloadBytes = core.serialize(payload);
    const packet = createPacket(payloadBytes);
    const bits = repeatBits(bytesToBits(packet));

    if (bits.length > wav.sampleCount) {
      throw new Error(
        "Audio is too short for this payload. Use a longer PCM WAV file."
      );
    }

    for (let i = 0; i < bits.length; i++) {
      const sampleByteOffset = wav.dataOffset + (i * 2);

      bytes[sampleByteOffset] =
        (bytes[sampleByteOffset] & 254) | bits[i];
    }

    return {
      blob: new Blob([bytes], { type: "audio/wav" }),
      mimeType: "audio/wav",
      sampleRate: wav.sampleRate,
      channels: wav.channels,
      sampleCount: wav.sampleCount,
      distributionId: payload.id,
      watermarkBytes: packet.length,
      repetitionFactor: REPETITIONS,
      method: "experimental-pcm-lsb"
    };
  }

  /*
   * Attempt to recover an IndieMark payload from a PCM WAV file.
   */

  async function extract(file) {
    const core = CORE();

    if (!core) {
      throw new Error(
        "WatermarkCore is not loaded. Load watermark-core.js first."
      );
    }

    if (!(file instanceof Blob)) {
      throw new Error("A valid audio file is required.");
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const wav = parseWav(bytes);

      const header = readRepeatedPacket(bytes, wav, HEADER_SIZE);

      for (let i = 0; i < MAGIC.length; i++) {
        if (header[i] !== MAGIC[i]) {
          return {
            found: false,
            reason: "No compatible IndieMark audio watermark was detected."
          };
        }
      }

      const payloadLength = bytesToNumber([
        header[4],
        header[5],
        header[6],
        header[7]
      ]);

      if (payloadLength < 1 || payloadLength > MAX_PAYLOAD_SIZE) {
        return {
          found: false,
          reason: "Invalid watermark payload length."
        };
      }

      const packet = readRepeatedPacket(
        bytes,
        wav,
        HEADER_SIZE + payloadLength
      );

      const result = core.deserialize(
        packet.slice(HEADER_SIZE)
      );

      if (!result.valid) {
        return {
          found: false,
          reason: result.reason
        };
      }

      return {
        found: true,
        payload: result.payload,
        method: "experimental-pcm-lsb",
        verified: true,
        note:
          "The payload checksum is valid. This does not prove who created or embedded the audio."
      };

    } catch (error) {
      return {
        found: false,
        reason: error.message || "Audio watermark could not be decoded."
      };
    }
  }

  const AudioEngine = Object.freeze({
    version: VERSION,
    method: "experimental-pcm-lsb",
    supportedFormat: "16-bit PCM WAV",
    embed,
    extract
  });

  root.IndieMark = root.IndieMark || {};
  root.IndieMark.AudioEngine = AudioEngine;

})(globalThis);

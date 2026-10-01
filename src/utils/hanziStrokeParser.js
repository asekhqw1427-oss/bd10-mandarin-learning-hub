/**
 * Decoder for the original APK .hanzi payload format used by the A0 assets.
 *
 * The outer shard record (codepoint + length) is handled by data/a0Stroke.js.
 * A payload starts with a little-endian uint16 command-stream length at bytes
 * 1..2.  The command stream begins at byte 3 and contains int16 LE geometry:
 *   1..25   moveTo (x, y)
 *   26..50  lineTo (x, y)
 *   51..75  quadraticBezierTo (cx, cy, x, y)
 *   76..100 cubicTo (c1x, c1y, c2x, c2y, x, y)
 *   101..125 close
 *   0       finish one stroke
 *
 * This mirrors the decoder recovered from the bundled Flutter AOT binary.
 * Bytes after the command stream are metadata used by the original app; they
 * are intentionally left untouched and are not needed for rendering paths.
 */

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readInt16LE(bytes, offset) {
  const value = readUint16LE(bytes, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

/**
 * Decode one extracted APK payload into independently renderable stroke paths.
 * @param {Uint8Array|ArrayLike<number>} payload
 * @param {string} [character]
 */
export function decodeHanziPayload(payload, character = "") {
  const bytes = payload instanceof Uint8Array ? payload : Uint8Array.from(payload || []);
  if (bytes.length < 4) throw new Error("Hanzi payload is too short.");

  const streamLength = readUint16LE(bytes, 1);
  const streamStart = 3;
  const streamEnd = streamStart + streamLength;
  if (!streamLength || streamEnd > bytes.length) {
    throw new Error("Hanzi payload command stream is truncated.");
  }

  const strokes = [];
  let commands = [];
  let offset = streamStart;
  while (offset < streamEnd) {
    const opcode = bytes[offset];
    if (opcode === 0) {
      if (!commands.length) throw new Error(`Empty stroke at payload offset ${offset}.`);
      if (commands[0].opcode < 1 || commands[0].opcode > 25) {
        throw new Error(`Stroke ${strokes.length + 1} has no moveTo command.`);
      }
      strokes.push(makeStroke(strokes.length + 1, commands));
      commands = [];
      offset += 1;
      continue;
    }

    let kind;
    let valueCount;
    if (opcode <= 25) {
      kind = "moveTo";
      valueCount = 2;
    } else if (opcode <= 50) {
      kind = "lineTo";
      valueCount = 2;
    } else if (opcode <= 75) {
      kind = "quadraticBezierTo";
      valueCount = 4;
    } else if (opcode <= 100) {
      kind = "cubicTo";
      valueCount = 6;
    } else if (opcode <= 125) {
      kind = "close";
      valueCount = 0;
    } else {
      throw new Error(`Unknown Hanzi path opcode ${opcode} at payload offset ${offset}.`);
    }

    const byteLength = 1 + valueCount * 2;
    if (offset + byteLength > streamEnd) {
      throw new Error(`Truncated ${kind} command at payload offset ${offset}.`);
    }
    const values = [];
    for (let index = 0; index < valueCount; index += 1) {
      values.push(readInt16LE(bytes, offset + 1 + index * 2));
    }
    commands.push({ opcode, kind, values });
    offset += byteLength;
  }

  if (commands.length) throw new Error("Hanzi payload ended before the final stroke delimiter.");
  if (!strokes.length) throw new Error("Hanzi payload contains no strokes.");
  return {
    character,
    strokeCount: strokes.length,
    strokes,
    viewBox: "0 0 1024 1024",
    payloadLength: bytes.length,
    commandStreamLength: streamLength,
  };
}

function makeStroke(index, commands) {
  const pathParts = [];
  for (const command of commands) {
    const values = command.values.map(formatNumber);
    if (command.kind === "moveTo") pathParts.push(`M ${values[0]} ${values[1]}`);
    else if (command.kind === "lineTo") pathParts.push(`L ${values[0]} ${values[1]}`);
    else if (command.kind === "quadraticBezierTo") pathParts.push(`Q ${values.join(" ")}`);
    else if (command.kind === "cubicTo") pathParts.push(`C ${values.join(" ")}`);
    else pathParts.push("Z");
  }
  return {
    index,
    path: pathParts.join(" "),
    commands,
    // The APK stores stroke-name indexes separately. No name is fabricated
    // here; callers can display a generic label when the optional metadata is
    // not decoded.
    name: null,
  };
}

export function extractHanziPayload(shardBytes, codePoint) {
  const bytes = shardBytes instanceof Uint8Array ? shardBytes : new Uint8Array(shardBytes);
  for (let offset = 0; offset + 4 <= bytes.length;) {
    const characterCodePoint = readUint16LE(bytes, offset);
    const payloadLength = readUint16LE(bytes, offset + 2);
    const payloadStart = offset + 4;
    const payloadEnd = payloadStart + payloadLength;
    if (payloadEnd > bytes.length) throw new Error(`Invalid .hanzi record at offset ${offset}.`);
    if (characterCodePoint === codePoint) return bytes.slice(payloadStart, payloadEnd);
    offset = payloadEnd;
  }
  return null;
}


const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function unknown() {
  return { format: 'unknown', width: null, height: null };
}

export function readImageMeta(buffer) {
  if (!Buffer.isBuffer(buffer)) return unknown();

  if (buffer.length >= 24 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) return unknown();

  let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) return unknown();
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) return unknown();
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    if (offset + 2 >= buffer.length) return unknown();
    const length = buffer.readUInt16BE(offset + 1);
    if (length < 2 || offset + 1 + length > buffer.length) return unknown();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return unknown();
      return {
        format: 'jpeg',
        height: buffer.readUInt16BE(offset + 4),
        width: buffer.readUInt16BE(offset + 6),
      };
    }
    offset += 1 + length;
  }

  return unknown();
}

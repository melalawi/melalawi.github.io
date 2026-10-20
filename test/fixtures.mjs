// Two published repos in progress.json schema 2, built to the unbake report fields (code/data/functions rows, blobs,
// platform, unknown, the parsed cartridge header) and one map per version (game one; game two is an older file with one `map`). Every byte of the ROM is one class: they sum to rom_size.
//
// Game one, us, ROM 0x20000 (131,072 B):
//   0x0000-0x1000 platform (4,096)        0x1000-0x1100 func_80000400, exact (256)     0x1100-0x1200 data (256)
//   0x3F00-0x4100 step, 87.5 % (512, over two rows)                                0x8000-0x9000 blob tex_a, decoded (4,096)
//   0x9000-0x9800 blob snd_a, identified (2,048)       0xA000-0xA400 blob obs, observed: bytes stay unknown
//   0xC000-0xC080 blob over, identified, 0xC040-0xC080 of it is func_80000900 (0 %, 64): code wins, blob keeps 64
export const progress = {
  schema: 2,
  carts: [
    {
      id: 'NUS-NXXP-0', version: 'eu', rom_size: 65536,
      code: { matched: 256, fuzzy: 0, total: 256 }, data: { matched: 0, fuzzy: 0, total: 0 }, functions: { matched: 1, fuzzy: 0, total: 1 },
      blobs: { decoded: 0, identified: 0, total: 0, by_type: {} }, platform: 4096, unknown: 61184,
    },
    {
      id: 'NUS-NXXE-1', version: 'us', rom_size: 131072,
      code: { matched: 256, fuzzy: 448, total: 832 }, data: { matched: 256, fuzzy: 0, total: 256 }, functions: { matched: 1234, fuzzy: 1, total: 3 },
      blobs: { decoded: 4096, identified: 2112, total: 6208, by_type: { model: { identified: 1 }, sound: { identified: 1 }, texture: { decoded: 1, observed: 1 } } },
      platform: 4096, unknown: 119680,
      header: {
        pi: { release: 3, page_size: 7, pulse_width: 0x12, latency: 0x40 }, clock_rate: 15, entry_point: 0x80000400, release: '2.0K',
        crc1: 0x12345678, crc2: 0x9abcdef0, name: 'Example Game', game_id: 'NXXE', country: 'North America', version: 1,
      },
    },
  ],
  maps: [{
    version: 'us',
    rom_size: 131072,
    fns: [
      ['func_80000400', 0x1000, 256, 100, 'src/a.c', 3],
      ['step', 0x3f00, 512, 87.5, 'src/a.c', 40],
      ['func_80000900', 0xc040, 64, 0, null, null],
    ],
    blobs: [
      ['tex_a', 0x8000, 4096, 'decoded', 'texture'],
      ['snd_a', 0x9000, 2048, 'identified', 'sound'],
      ['obs', 0xa000, 1024, 'observed', 'texture'],
      ['over', 0xc000, 128, 'identified', 'model'],
    ],
    spans: { data: [[0x1100, 0x1200]], platform: [[0, 0x1000]] },
  }, {
    version: 'eu',
    rom_size: 65536,
    fns: [['func_80000400', 0x1000, 256, 100, 'src/a.c', 3]],
    blobs: [],
    spans: { data: [], platform: [[0, 0x1000]] },
  }],
};

// Game two has no blob evidence: its blobs row is 0 of 0 and the rest of the ROM is unknown.
export const progressTwo = {
  schema: 2,
  carts: [
    {
      id: 'NUS-NBTE-0', version: 'us', rom_size: 65536,
      code: { matched: 128, fuzzy: 0, total: 192 }, data: { matched: 64, fuzzy: 0, total: 64 }, functions: { matched: 2, fuzzy: 0, total: 3 },
      blobs: { decoded: 0, identified: 0, total: 0, by_type: {} }, platform: 4096, unknown: 61184,
    },
  ],
  map: {
    version: 'us',
    rom_size: 65536,
    fns: [['alpha', 0x1000, 128, 100, 'src/t.c', 1], ['beta', 0x1080, 64, 0, null, null]],
    blobs: [],
    spans: { data: [[0x1200, 0x1240]], platform: [[0, 0x1000]] },
  },
};

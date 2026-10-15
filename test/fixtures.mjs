// A small published repo: progress.json, a two-segment memory map SVG in the published layout and symbols.json.
// Row 0x0000: segment edge mark at 0x1000, func_80000400 (exact, 0x1000-0x1100), a.c static `step` (87 %, split
// over rows 0x0000 and 0x4000 at 0x3F00-0x4100). Row 0xC000 (after a row gap): asm-only func_80000900.
export const progress = {
  schema: 1,
  head: 'c0ffee',
  updated: '2026-10-15T10:00:00-07:00',
  carts: [
    { id: 'NUS-NXXP-0', version: 'eu', functions: { matched: 1, total: 3 }, text_pct: 33.33, bytes: { matched: 256, fuzzy: 512, asm: 64, total: 832 }, toolchain: 'gcc-x' },
    { id: 'NUS-NXXE-1', version: 'us', functions: { matched: 1234, total: 3 }, text_pct: 30.77, bytes: { matched: 256, fuzzy: 512, asm: 64, total: 832 }, toolchain: 'gcc-x' },
  ],
};

export const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1096 30" width="1096" height="30"><style>text{font:6px monospace}</style>
<g transform="translate(0 0)"><text y="6">00000000</text>
<rect class="h" x="72" width="0.5" height="6"/>
<rect class="h" x="328" width="0.5" height="6"/>
<rect class="q10" x="328" width="16" height="6"><title>func_80000400 · 100% · 256 B</title></rect>
<rect class="q8" x="1080" width="16" height="6"><title>step · 87.5% · 512 B</title></rect>
</g>
<g transform="translate(0 8)"><text y="6">00004000</text>
<rect class="q8" x="72" width="16" height="6"><title>step · 87.5% · 512 B</title></rect>
</g>
<g transform="translate(0 16)"><text y="6">0000C000</text>
<rect class="q0" x="76" width="4" height="6"><title>func_80000900 · 0% · 64 B</title></rect>
</g>
</svg>`;

export const symbols = {
  schema: 1,
  functions: {
    func_80000400: { path: 'src/a.c', line: 3 },
    step: { path: 'src/a.c', line: 40 },
  },
};

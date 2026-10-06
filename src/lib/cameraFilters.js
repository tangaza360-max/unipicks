// Camera filters (camera part 3, founder decision 2026-10-05: 5 simple
// filters). Each filter is ONE colour matrix used twice:
//   * live preview: an SVG feColorMatrix on the <video> (CSS filter: url()),
//   * saved photo / GIF frames: applyFilter() on the pixels,
// so the photo looks exactly like the preview.
//
// A matrix is 3 rows (R, G, B), each [r, g, b, offset]; offset is 0–255.

export const FILTERS = [
  { id: 'original', label: 'Original', matrix: null },
  {
    id: 'warm',
    label: 'Warm',
    matrix: [
      [1.08, 0.02, 0, 10],
      [0, 1.02, 0, 4],
      [0, 0, 0.88, 0],
    ],
  },
  {
    id: 'cool',
    label: 'Cool',
    matrix: [
      [0.9, 0, 0, 0],
      [0, 1.0, 0.02, 2],
      [0, 0.02, 1.1, 12],
    ],
  },
  {
    id: 'bw',
    label: 'B&W',
    matrix: [
      [0.33, 0.6, 0.12, -8],
      [0.33, 0.6, 0.12, -8],
      [0.33, 0.6, 0.12, -8],
    ],
  },
  {
    id: 'bright',
    label: 'Bright',
    matrix: [
      [1.12, 0, 0, 14],
      [0, 1.12, 0, 14],
      [0, 0, 1.12, 14],
    ],
  },
]

export function nextFilterIndex(index, step = 1) {
  const n = FILTERS.length
  return (((index + step) % n) + n) % n
}

// `values` for <feColorMatrix type="matrix">: 4 rows × 5 columns, offsets
// as fractions of 255, alpha unchanged.
export function svgMatrixValues(matrix) {
  if (!matrix) return '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0'
  const rows = matrix.map(([r, g, b, offset]) => [r, g, b, 0, +(offset / 255).toFixed(6)].join(' '))
  return [...rows, '0 0 0 1 0'].join('  ')
}

// Apply in place to RGBA pixels (ImageData.data). Alpha is not changed.
export function applyFilter(data, matrix) {
  if (!matrix) return data
  const [[rr, rg, rb, ro], [gr, gg, gb, go], [br, bg, bb, bo]] = matrix
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Uint8ClampedArray rounds and clamps to 0–255 by itself.
    data[i] = rr * r + rg * g + rb * b + ro
    data[i + 1] = gr * r + gg * g + gb * b + go
    data[i + 2] = br * r + bg * g + bb * b + bo
  }
  return data
}

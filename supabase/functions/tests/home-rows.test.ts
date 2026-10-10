// Home discovery rows (src/lib/homeRows.js): no row with a single card, no row
// that repeats the full list, no two rows with exactly the same deals.
import { assertEquals } from 'jsr:@std/assert@1'
import { discoveryRows, MIN_ROW } from '../../../src/lib/homeRows.js'

const d = (id: string) => ({ id })
const names = (rows: [string, unknown[]][]) => rows.map(([title]) => title)

Deno.test('a row needs at least 2 deals', () => {
  assertEquals(MIN_ROW, 2)
  const rows = discoveryRows([['Available now', [d('a')]], ['Under 3,000 RWF', [d('a'), d('b')]]], 5)
  assertEquals(names(rows), ['Under 3,000 RWF'])
})

Deno.test('a row with every deal is left out (it would repeat All deals)', () => {
  assertEquals(names(discoveryRows([['New this week', [d('a'), d('b'), d('c')]]], 3)), [])
})

Deno.test('two rows with exactly the same deals: only the first shows', () => {
  const rows = discoveryRows([
    ['Group buys', [d('a'), d('b')]],
    ['New this week', [d('b'), d('a')]],
    ['Available now', [d('a'), d('c')]],
  ], 6)
  assertEquals(names(rows), ['Group buys', 'Available now'])
})

Deno.test('many deals: every useful row shows, in order', () => {
  const rows = discoveryRows([
    ['Available now', [d('a'), d('b'), d('c')]],
    ['Under 3,000 RWF', [d('c'), d('d')]],
    ['Group buys', [d('e'), d('f')]],
    ['New this week', [d('a'), d('f'), d('g')]],
  ], 20)
  assertEquals(names(rows), ['Available now', 'Under 3,000 RWF', 'Group buys', 'New this week'])
})

Deno.test('empty rows never show', () => {
  assertEquals(names(discoveryRows([['Group buys', []]], 4)), [])
})

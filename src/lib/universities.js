// Each university that's live on Unipicks gets its verified student
// email domain listed here. A university with `domain: null` shows in the
// picker but isn't open for signup yet — swap in its real domain to launch it.
export const UNIVERSITIES = [
  { name: 'Kepler College', domain: 'keplercollege.ac.rw' },
  { name: 'University of Rwanda', domain: null },
  { name: 'ALU Rwanda', domain: null },
  { name: 'Carnegie Mellon Africa', domain: null },
  { name: 'AUCA', domain: null },
]

export function domainForUniversity(universityName) {
  return UNIVERSITIES.find((u) => u.name === universityName)?.domain ?? null
}

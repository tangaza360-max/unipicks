export function haptic(pattern = 10) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern)
    }
  } catch {
    // Haptics are best-effort and should never interrupt the UI.
  }
}

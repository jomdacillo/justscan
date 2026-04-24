/**
 * Tiny haptic helper. Uses the Vibration API where available
 * (Android Chrome). iOS Safari ignores it but the calls are no-ops,
 * so it's safe to scatter through the UI.
 */

const canVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

export const haptics = {
  light()    { if (canVibrate) navigator.vibrate(8) },
  medium()   { if (canVibrate) navigator.vibrate(15) },
  heavy()    { if (canVibrate) navigator.vibrate(25) },
  success()  { if (canVibrate) navigator.vibrate([10, 40, 10]) },
  warning()  { if (canVibrate) navigator.vibrate([20, 60, 20]) },
  error()    { if (canVibrate) navigator.vibrate([30, 80, 30, 80, 30]) },
  selection(){ if (canVibrate) navigator.vibrate(5) },
}

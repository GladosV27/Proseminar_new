const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim()
  || 'https://gladosv27.github.io/Proseminar_new/'

/**
 * Capacitor rendert gebündelte Dateien unter https://localhost. Diese Adresse
 * darf nie in einem QR-Code für andere Handys landen; in der APK wird deshalb
 * die öffentliche Pages-Adresse mit denselben Query-Parametern geteilt.
 */
export function shareableAppUrl(current = window.location.href): URL {
  const local = new URL(current)
  if (local.origin !== 'https://localhost' && local.protocol !== 'capacitor:') return local
  const publicUrl = new URL(PUBLIC_APP_URL)
  publicUrl.search = local.search
  publicUrl.hash = ''
  return publicUrl
}

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * QR-Overlay: zeigt die aktuelle App-URL als QR-Code – fürs Seminar:
 * Code an die Wand, Kommilitonen scannen und haben die App auf dem
 * eigenen Gerät (PWA, danach offline nutzbar).
 */
export default function QrOverlay({ onClose }: { onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const url = window.location.href.split('#')[0]
  const isLocal = /localhost|127\.0\.0\.1/.test(url)

  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      color: { dark: '#141413', light: '#faf9f5' },
    }).then(setDataUrl)
  }, [url])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(20,20,19,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
        <h3 style={{ fontFamily: 'var(--serif)', fontSize: 20 }}>App teilen</h3>
        {dataUrl ? (
          <img src={dataUrl} alt={`QR-Code für ${url}`} style={{ width: '100%', maxWidth: 300, borderRadius: 12 }} />
        ) : (
          <p className="hint">Erzeuge QR-Code …</p>
        )}
        <p className="hint mono" style={{ wordBreak: 'break-all', fontSize: 11.5 }}>
          {url}
        </p>
        {isLocal && (
          <p className="hint" style={{ fontSize: 12 }}>
            ⚠ Das ist eine lokale Adresse – fürs Seminar die GitHub-Pages-URL öffnen und dort teilen.
          </p>
        )}
        <button className="btn" onClick={onClose} style={{ marginTop: 6 }}>
          Schließen
        </button>
      </div>
    </div>
  )
}

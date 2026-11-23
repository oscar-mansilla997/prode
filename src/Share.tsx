/** Abre WhatsApp con el mensaje listo para elegir a quién mandárselo. Solo un ícono chico. */
export default function ShareButton({ text, url, label = 'Compartir por WhatsApp', className = '' }: { text: string; url: string; label?: string; className?: string }) {
  const href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
  return (
    <a className={`sharebtn ${className}`.trim()} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24">
        <path d="M3.5 20.5l1.3-4.4A8.5 8.5 0 1 1 8 19.3z" />
        <path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .8c-.9-.4-1.7-1.2-2.1-2.100l.8-1-1-2z" />
      </svg>
    </a>
  )
}

export const appUrl = () => `${location.origin}${location.pathname}`

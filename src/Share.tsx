/** Abre WhatsApp con el mensaje listo para elegir a quién mandárselo. */
export default function ShareButton({ text, url, label = 'Compartir por WhatsApp', ghost = true }: { text: string; url: string; label?: string; ghost?: boolean }) {
  const href = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
  return (
    <a className={ghost ? 'sharebtn' : 'sharebtn solid'} href={href} target="_blank" rel="noreferrer">
      <svg viewBox="0 0 24 24"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg>
      {label}
    </a>
  )
}

export const appUrl = () => `${location.origin}${location.pathname}`

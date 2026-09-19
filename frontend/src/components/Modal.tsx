import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  eyebrow: string
  title: string
  children: ReactNode
  onClose: () => void
  size?: 'regular' | 'compact'
}

export function Modal({
  eyebrow,
  title,
  children,
  onClose,
  size = 'regular',
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <section
        className={`modal-panel modal-panel--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <header className="modal-header">
          <div>
            <p>{eyebrow}</p>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="关闭对话框"
          >
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

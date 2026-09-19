import { Modal } from '../../components/Modal'

interface ConfirmDeleteProps {
  kind: 'plan' | 'day'
  name: string
  submitting: boolean
  onCancel: () => void
  onConfirm: () => Promise<void>
}

export function ConfirmDelete({
  kind,
  name,
  submitting,
  onCancel,
  onConfirm,
}: ConfirmDeleteProps) {
  return (
    <Modal eyebrow="Irreversible action" title="确认删除" size="compact" onClose={onCancel}>
      <div className="confirm-copy">
        <p>
          确定删除{kind === 'plan' ? '旅游计划' : '每日路线'}“{name}”吗？
        </p>
        <span>
          {kind === 'plan'
            ? '计划内的所有每日路线也会一起删除，此操作无法撤销。'
            : '以后添加在这一天的地点也会随路线删除。此操作无法撤销。'}
        </span>
      </div>
      <footer className="form-actions">
        <button className="text-button" type="button" onClick={onCancel}>
          保留
        </button>
        <button className="danger-button" type="button" disabled={submitting} onClick={onConfirm}>
          {submitting ? '正在删除…' : '确认删除'}
        </button>
      </footer>
    </Modal>
  )
}

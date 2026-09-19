import { useState, type FormEvent } from 'react'
import type { TripPlanDetail, TripPlanInput } from '../../api/types'
import { addDays, toIsoDate } from '../../utils/dates'

interface TripPlanFormProps {
  initialPlan?: TripPlanDetail
  submitting: boolean
  serverError: string | null
  onCancel: () => void
  onSubmit: (input: TripPlanInput) => Promise<void>
}

function createInitialValue(plan?: TripPlanDetail): TripPlanInput {
  const today = toIsoDate(new Date())
  return {
    timezone: plan?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    title: plan?.title ?? '',
    destination: plan?.destination ?? '',
    startDate: plan?.startDate ?? today,
    endDate: plan?.endDate ?? addDays(today, 2),
    notes: plan?.notes ?? '',
  }
}

export function TripPlanForm({
  initialPlan,
  submitting,
  serverError,
  onCancel,
  onSubmit,
}: TripPlanFormProps) {
  const [value, setValue] = useState(() => createInitialValue(initialPlan))
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (value.endDate < value.startDate) {
      setValidationError('结束日期不能早于开始日期')
      return
    }
    setValidationError(null)
    await onSubmit(value)
  }

  const update = (field: keyof TripPlanInput, nextValue: string) => {
    setValue((current) => ({ ...current, [field]: nextValue }))
  }

  return (
    <form className="editor-form" onSubmit={handleSubmit}>
      <div className="field-grid field-grid--two">
        <label className="field">
          <span>计划名称</span>
          <input
            autoFocus
            required
            maxLength={120}
            value={value.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="例如：濑户内海慢游"
          />
        </label>
        <label className="field">
          <span>主要目的地</span>
          <input
            required
            maxLength={120}
            value={value.destination}
            onChange={(event) => update('destination', event.target.value)}
            placeholder="例如：高松 · 直岛"
          />
        </label>
      </div>

      <div className="field-grid field-grid--two">
        <label className="field">
          <span>开始日期</span>
          <input
            type="date"
            required
            value={value.startDate}
            onChange={(event) => update('startDate', event.target.value)}
          />
        </label>
        <label className="field">
          <span>结束日期</span>
          <input
            type="date"
            required
            min={value.startDate}
            value={value.endDate}
            onChange={(event) => update('endDate', event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span>旅程时区（IANA）</span>
        <input required value={value.timezone} onChange={(event) => update('timezone', event.target.value)} placeholder="Europe/Istanbul" />
      </label>

      <label className="field">
        <span>计划备注 <small>选填</small></span>
        <textarea
          maxLength={2000}
          rows={4}
          value={value.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="写下这次旅行的主题、节奏或同行者……"
        />
      </label>

      {(validationError || serverError) && (
        <p className="form-error" role="alert">
          {validationError || serverError}
        </p>
      )}

      <footer className="form-actions">
        <button className="text-button" type="button" onClick={onCancel}>
          取消
        </button>
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? '正在保存…' : initialPlan ? '保存计划' : '创建计划'}
          <span aria-hidden="true">↗</span>
        </button>
      </footer>
    </form>
  )
}

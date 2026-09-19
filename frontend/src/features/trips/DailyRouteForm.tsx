import { useMemo, useState, type FormEvent } from 'react'
import type { DailyRoute, DailyRouteInput } from '../../api/types'
import { addDays } from '../../utils/dates'

interface DailyRouteFormProps {
  route?: DailyRoute
  startDate: string
  endDate: string
  usedDates: string[]
  submitting: boolean
  serverError: string | null
  onCancel: () => void
  onSubmit: (input: DailyRouteInput) => Promise<void>
}

function firstAvailableDate(startDate: string, endDate: string, usedDates: string[]) {
  const used = new Set(usedDates)
  let cursor = startDate
  while (cursor <= endDate) {
    if (!used.has(cursor)) return cursor
    cursor = addDays(cursor, 1)
  }
  return startDate
}

export function DailyRouteForm({
  route,
  startDate,
  endDate,
  usedDates,
  submitting,
  serverError,
  onCancel,
  onSubmit,
}: DailyRouteFormProps) {
  const availableDate = useMemo(
    () => firstAvailableDate(startDate, endDate, usedDates),
    [endDate, startDate, usedDates],
  )
  const [value, setValue] = useState<DailyRouteInput>({
    routeDate: route?.routeDate ?? availableDate,
    title: route?.title ?? '',
    notes: route?.notes ?? '',
    routeColor: route?.routeColor ?? '#E95F43',
  })
  const [validationError, setValidationError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (value.routeDate < startDate || value.routeDate > endDate) {
      setValidationError('路线日期必须在计划日期范围内')
      return
    }
    if (usedDates.includes(value.routeDate)) {
      setValidationError('这一天已经有每日路线了')
      return
    }
    setValidationError(null)
    await onSubmit(value)
  }

  const update = (field: keyof DailyRouteInput, nextValue: string) => {
    setValue((current) => ({ ...current, [field]: nextValue }))
  }

  return (
    <form className="editor-form" onSubmit={handleSubmit}>
      <div className="field-grid field-grid--date-color">
        <label className="field">
          <span>路线日期</span>
          <input
            autoFocus
            type="date"
            required
            min={startDate}
            max={endDate}
            value={value.routeDate}
            onChange={(event) => update('routeDate', event.target.value)}
          />
        </label>
        <label className="field field--color">
          <span>路线颜色</span>
          <span className="color-input-wrap">
            <input
              type="color"
              value={value.routeColor}
              onChange={(event) => update('routeColor', event.target.value)}
            />
            <code>{value.routeColor.toUpperCase()}</code>
          </span>
        </label>
      </div>

      <label className="field">
        <span>当天标题 <small>留空将按 Day 自动命名</small></span>
        <input
          maxLength={120}
          value={value.title}
          onChange={(event) => update('title', event.target.value)}
          placeholder="例如：美术馆与海边落日"
        />
      </label>

      <label className="field">
        <span>当天备注 <small>选填</small></span>
        <textarea
          maxLength={2000}
          rows={4}
          value={value.notes}
          onChange={(event) => update('notes', event.target.value)}
          placeholder="记录当天重点、预约时间或出发提醒……"
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
          {submitting ? '正在保存…' : route ? '保存每日路线' : '添加每日路线'}
          <span aria-hidden="true">↗</span>
        </button>
      </footer>
    </form>
  )
}

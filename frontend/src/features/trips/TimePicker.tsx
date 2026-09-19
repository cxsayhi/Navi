import { useRef } from 'react'

interface TimePickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
}

const hours = Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, value) => String(value).padStart(2, '0'))

export function TimePicker({ label, value, onChange, hint }: TimePickerProps) {
  const details = useRef<HTMLDetailsElement>(null)
  const [hour = '09', minute = '00'] = value ? value.split(':') : []
  const close = () => details.current?.removeAttribute('open')

  return (
    <div className="field time-picker">
      <span>{label}</span>
      <details ref={details}>
        <summary role="button" aria-label={label}>
          <strong>{value || '--:--'}</strong>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="time-picker-menu" role="group" aria-label={`${label}时间选择`}>
          <label>
            <span>小时</span>
            <select aria-label={`${label}小时`} size={6} value={hour} onChange={(event) => onChange(`${event.target.value}:${minute}`)}>
              {hours.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <b aria-hidden="true">:</b>
          <label>
            <span>分钟</span>
            <select aria-label={`${label}分钟`} size={6} value={minute} onChange={(event) => onChange(`${hour}:${event.target.value}`)}>
              {minutes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <div className="time-picker-actions">
            <button type="button" onClick={() => { onChange(''); close() }}>清除</button>
            <button type="button" onClick={close}>完成时间选择</button>
          </div>
        </div>
      </details>
      {hint && <small>{hint}</small>}
    </div>
  )
}

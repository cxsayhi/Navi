import type { TripPlanSummary } from '../../api/types'
import { formatDateRange } from '../../utils/dates'

interface PlanSidebarProps {
  plans: TripPlanSummary[]
  selectedPlanId: number | null
  loading: boolean
  onCreate: () => void
  onSelect: (planId: number) => void
}

export function PlanSidebar({
  plans,
  selectedPlanId,
  loading,
  onCreate,
  onSelect,
}: PlanSidebarProps) {
  return (
    <aside className="plan-sidebar">
      <div className="sidebar-heading">
        <div>
          <p>Travel archive</p>
          <h2>我的旅程</h2>
        </div>
        <button className="square-button" type="button" onClick={onCreate} aria-label="创建旅游计划">
          +
        </button>
      </div>

      <div className="plan-list" aria-label="旅游计划列表">
        {loading && plans.length === 0 && (
          <div className="sidebar-loading" aria-label="正在读取旅游计划">
            <span />
            <span />
            <span />
          </div>
        )}

        {!loading && plans.length === 0 && (
          <button className="sidebar-empty" type="button" onClick={onCreate}>
            <span aria-hidden="true">＋</span>
            <strong>建立第一份旅程档案</strong>
            <small>从目的地与日期开始</small>
          </button>
        )}

        {plans.map((plan, index) => {
          const selected = selectedPlanId === plan.id
          return (
            <button
              className={`plan-list-item${selected ? ' plan-list-item--selected' : ''}`}
              type="button"
              key={plan.id}
              onClick={() => onSelect(plan.id)}
              aria-current={selected ? 'page' : undefined}
            >
              <span className="plan-list-index">{String(index + 1).padStart(2, '0')}</span>
              <span className="plan-list-copy">
                <strong>{plan.title}</strong>
                <small>{plan.destination}</small>
                <em>{formatDateRange(plan.startDate, plan.endDate)}</em>
              </span>
              <span className="plan-list-progress">
                {plan.plannedDayCount}/{plan.dayCount}
              </span>
            </button>
          )
        })}
      </div>

      <div className="sidebar-note">
        <span>W</span>
        <p>把想去的地方按日整理，让每一段旅程都有清晰的方向。</p>
      </div>
    </aside>
  )
}

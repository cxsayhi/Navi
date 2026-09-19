import type {
  NavigationRoute,
  DisplayPoint,
  TravelMode,
} from '../../api/types'

export type NavigationIssueKind = 'NO_ROUTE' | 'TIMEOUT' | 'QUOTA' | 'SERVICE'

export interface NavigationIssue {
  kind: NavigationIssueKind
  message: string
}

interface RouteNavigationPanelProps {
  origin: DisplayPoint
  destination: DisplayPoint
  segmentIndex: number
  mode: TravelMode
  options: NavigationRoute[]
  route: NavigationRoute | null
  selectedOptionId: string | null
  loading: boolean
  error: NavigationIssue | null
  onModeChange: (mode: TravelMode) => void
  onOptionChange: (optionId: string) => void
  onRetry: () => void
  onClose: () => void
}

const modes: Array<{ value: TravelMode; label: string; glyph: string }> = [
  { value: 'WALK', label: '步行', glyph: '↟' },
  { value: 'DRIVE', label: '驾车', glyph: '→' },
  { value: 'TRANSIT', label: '公交', glyph: '▦' },
]

function navigationUrl(origin: DisplayPoint, destination: DisplayPoint, mode: TravelMode) {
  const params = new URLSearchParams({
    api: '1',
    origin: origin.name,
    destination: destination.name,
    origin_place_id: origin.googlePlaceId,
    destination_place_id: destination.googlePlaceId,
    travelmode: {
      WALK: 'walking',
      DRIVE: 'driving',
      TRANSIT: 'transit',
    }[mode],
  })
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

function stepLabel(mode: TravelMode) {
  return {
    WALK: '步行',
    DRIVE: '驾车',
    TRANSIT: '乘车',
  }[mode]
}

function optionLabel(
  option: NavigationRoute,
  index: number,
  options: NavigationRoute[],
) {
  if (option.recommended) return 'Google 推荐'
  const alternativeNumber = options
    .slice(0, index + 1)
    .filter((candidate) => !candidate.recommended)
    .length
  return `备选 ${String(alternativeNumber).padStart(2, '0')}`
}

function issueTitle(issue: NavigationIssue, mode: TravelMode) {
  if (issue.kind === 'NO_ROUTE' && mode === 'TRANSIT') return '两点之间暂无公交方案'
  if (issue.kind === 'NO_ROUTE') return '两点之间没有可用路线'
  if (issue.kind === 'TIMEOUT') return '地图服务响应超时'
  if (issue.kind === 'QUOTA') return '地图项目额度暂时耗尽'
  return '地图路线服务暂时不可用'
}

export function RouteNavigationPanel({
  origin,
  destination,
  segmentIndex,
  mode,
  options,
  route,
  selectedOptionId,
  loading,
  error,
  onModeChange,
  onOptionChange,
  onRetry,
  onClose,
}: RouteNavigationPanelProps) {
  return (
    <section className="navigation-panel" aria-label={`${origin.name}到${destination.name}的导航方案`}>
      <header className="navigation-panel-header">
        <div className="segment-ticket-number" aria-hidden="true">
          {String(segmentIndex + 1).padStart(2, '0')}
          <span>→</span>
          {String(segmentIndex + 2).padStart(2, '0')}
        </div>
        <div>
          <p>Selected route segment</p>
          <h3>{origin.name} <span>至</span> {destination.name}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭导航方案">×</button>
      </header>

      <div className="travel-mode-switcher" role="group" aria-label="选择交通方式">
        {modes.map((item) => (
          <button
            key={item.value}
            type="button"
            className={mode === item.value ? 'travel-mode-button travel-mode-button--active' : 'travel-mode-button'}
            aria-pressed={mode === item.value}
            onClick={() => onModeChange(item.value)}
          >
            <span aria-hidden="true">{item.glyph}</span>
            {item.label}
          </button>
        ))}
      </div>

      <div className="navigation-panel-body" aria-live="polite">
        {mode === 'WALK' && <p className="navigation-warning">步行路线处于 Beta 阶段，可能缺少人行道或步行路径；请留意实际路况。</p>}
        {loading && (
          <div className="navigation-loading" aria-label="正在规划路线">
            <span />
            <span />
            <span />
            <p>Google 正在计算{modes.find((item) => item.value === mode)?.label}路线与备选方案…</p>
          </div>
        )}

        {!loading && error && (
          <div className={`navigation-error navigation-error--${error.kind.toLowerCase()}`} role="alert">
            <span aria-hidden="true">{error.kind === 'TIMEOUT' ? '⌛' : error.kind === 'NO_ROUTE' ? '∅' : '!'}</span>
            <div>
              <strong>{issueTitle(error, mode)}</strong>
              <p>{error.message}</p>
              {error.kind === 'NO_ROUTE' && mode === 'TRANSIT' ? (
                <div className="navigation-state-actions">
                  <button type="button" onClick={() => onModeChange('WALK')}>查看步行</button>
                  <button type="button" onClick={() => onModeChange('DRIVE')}>查看驾车</button>
                </div>
              ) : (
                <button type="button" onClick={onRetry}>
                  {error.kind === 'QUOTA' ? '再次检查' : '重新计算'}
                </button>
              )}
            </div>
          </div>
        )}

        {!loading && !error && options.length > 0 && (
          <div className="navigation-option-section">
            <div className="navigation-option-heading">
              <span>Route alternatives · {String(options.length).padStart(2, '0')}</span>
              <em className="route-source">实时结果</em>
            </div>
            <div className="navigation-option-list" role="radiogroup" aria-label={`${stepLabel(mode)}备选方案`}>
              {options.map((option, index) => {
                const selected = option.optionId === selectedOptionId
                return (
                  <button
                    key={option.optionId}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected
                      ? 'navigation-option-card navigation-option-card--selected'
                      : 'navigation-option-card'}
                    onClick={() => onOptionChange(option.optionId)}
                  >
                    <span>
                      {optionLabel(option, index, options)}
                    </span>
                    <strong>{option.durationText}</strong>
                    <small>{option.distanceText} · {option.steps.length} 步</small>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {!loading && !error && route && (
          <>
            <div className="navigation-summary">
              <div>
                <small>Estimated time</small>
                <strong>{route.durationText}</strong>
              </div>
              <div>
                <small>Distance</small>
                <strong>{route.distanceText}</strong>
              </div>
              <span>{stepLabel(route.travelMode)}</span>
            </div>

            {route.steps.length > 0 ? (
              <ol className="navigation-step-list">
                {route.steps.map((step, index) => (
                  <li key={`${index}-${step.instruction}`}>
                    <span className="navigation-step-index">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <strong>{step.instruction}</strong>
                      {step.transitLine && (
                        <span className="transit-line-chip">
                          {step.transitLine}
                          {step.stopCount ? ` · ${step.stopCount} 站` : ''}
                        </span>
                      )}
                      {step.departureStop && step.arrivalStop && (
                        <small>{step.departureStop} → {step.arrivalStop}</small>
                      )}
                    </div>
                    <em>{step.distanceText} · {step.durationText}</em>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="navigation-no-steps">Google 已返回路线折线；本次没有提供分步文字指引。</p>
            )}

            {route.warnings.length > 0 && (
              <p className="navigation-warning">{route.warnings.join(' · ')}</p>
            )}
          </>
        )}

      </div>

      <footer className="navigation-panel-footer">
        <span>GOOGLE ROUTES · ALTERNATIVES</span>
        <a
          href={navigationUrl(origin, destination, mode)}
          target="_blank"
          rel="noreferrer"
        >
          在 Google Maps 中继续 <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </section>
  )
}

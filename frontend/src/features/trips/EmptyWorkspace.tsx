interface EmptyWorkspaceProps {
  onCreate: () => void
}

export function EmptyWorkspace({ onCreate }: EmptyWorkspaceProps) {
  return (
    <section className="workspace-empty" aria-labelledby="empty-title">
      <div className="workspace-empty-copy">
        <p>Begin a new journey</p>
        <h1 id="empty-title">
          每一段路线，
          <em>都从一个日期开始。</em>
        </h1>
        <span>
          建立旅游计划，确定目的地和出行时间，再把每天整理成独立路线。
        </span>
        <button className="primary-button" type="button" onClick={onCreate}>
          创建第一份计划 <span aria-hidden="true">↗</span>
        </button>
      </div>
      <div className="workspace-empty-visual" aria-hidden="true">
        <span className="visual-coordinate">31.2304° N · 121.4737° E</span>
        <span className="visual-day">DAY<br /><strong>01</strong></span>
        <svg viewBox="0 0 520 540">
          <path d="M-10 105C91 53 178 69 238 116s126 52 194 5 95-34 121-18" />
          <path d="M-25 350c83-52 156-51 229-7s143 32 211-22 97-49 130-41" />
          <path d="M113-12c-16 93 17 154 69 207s42 114-8 181-36 122 25 183" />
          <path className="visual-route" d="M96 438c42-86 75-122 139-132s92-24 109-84 44-88 100-126" />
          <circle cx="96" cy="438" r="16" />
          <circle cx="344" cy="222" r="16" />
          <circle cx="444" cy="96" r="16" />
        </svg>
        <span className="visual-caption">Your route begins here</span>
      </div>
    </section>
  )
}

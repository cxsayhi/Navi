import { Modal } from './Modal'

export type SiteInformationKind = 'help' | 'privacy' | 'terms'

interface SiteInformationProps {
  kind: SiteInformationKind
  onClose: () => void
}

const SUPPORT_EMAIL = 'ChanceT66@outlook.com'

export function SiteInformation({ kind, onClose }: SiteInformationProps) {
  if (kind === 'help') {
    return (
      <Modal eyebrow="Wanderline guide" title="使用帮助" onClose={onClose}>
        <div className="site-information">
          <p className="site-information-lead">从日期和目的地开始，把零散灵感整理成一段清晰旅程。</p>
          <ol className="help-steps">
            <li><span>01</span><div><strong>创建一段旅程</strong><p>填写计划名称、目的地、日期和当地时区，系统会按日期建立每日路线。</p></div></li>
            <li><span>02</span><div><strong>加入并排列地点</strong><p>搜索 Google Maps 地点，点击地点栏可补充名称、备注与到离时间，也可拖动调整顺序。</p></div></li>
            <li><span>03</span><div><strong>比较交通方案</strong><p>点击两个地点之间的导航图标，比较步行、驾车与公交方案；路线结果以实时服务为准。</p></div></li>
            <li><span>04</span><div><strong>预览全部路线</strong><p>切换到多日总览，检查每天的颜色、地点顺序和跨日安排。</p></div></li>
          </ol>
          <p className="site-information-contact">仍需帮助？<a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
        </div>
      </Modal>
    )
  }

  if (kind === 'privacy') {
    return (
      <Modal eyebrow="Privacy" title="隐私政策" onClose={onClose}>
        <article className="site-information legal-copy">
          <p className="legal-updated">更新日期：2026 年 9 月 20 日</p>
          <h3>我们保存什么</h3>
          <p>Wanderline 保存你主动填写的旅行计划、日期、时区、地点备注和 Google Place ID，以便在刷新后恢复行程。</p>
          <h3>Google Maps 数据</h3>
          <p>地点名称、地址、坐标和路线由 Google Maps、Places API (New) 与 Routes API 在使用时提供。Wanderline 不把 Google 返回的地点详情、路线折线或导航结果永久写入数据库。</p>
          <h3>数据用途与删除</h3>
          <p>数据仅用于展示和编辑你的旅行计划。删除计划会同时删除其中的每日路线和地点引用。请勿在备注中填写身份证件、支付信息等敏感内容。</p>
          <h3>第三方服务</h3>
          <p>使用地图和路线功能时，请求会发送至 Google，并受 Google 的隐私政策和服务条款约束。</p>
          <h3>联系我们</h3>
          <p>如需反馈隐私问题或申请删除数据，请发送邮件至 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>。</p>
        </article>
      </Modal>
    )
  }

  return (
    <Modal eyebrow="Terms" title="服务条款" onClose={onClose}>
      <article className="site-information legal-copy">
        <p className="legal-updated">生效日期：2026 年 9 月 20 日</p>
        <h3>服务说明</h3>
        <p>Wanderline 提供旅行计划、地点整理和路线比较工具。你应对录入内容及实际出行决定负责。</p>
        <h3>路线与时刻</h3>
        <p><strong>路线仅供规划参考。</strong>交通时间、公交班次、道路状态和地点开放情况可能随时变化，出发前请通过官方渠道再次确认。</p>
        <h3>合理使用</h3>
        <p>不得利用本服务进行违法活动、批量抓取、绕过访问限制、攻击系统或消耗异常数量的地图服务配额。</p>
        <h3>服务可用性</h3>
        <p>地图和路线依赖第三方服务，可能因网络、覆盖范围、配额或维护暂时不可用。我们会尽力提供明确提示，但不保证服务持续无中断。</p>
        <h3>联系与反馈</h3>
        <p>使用本服务即表示你理解以上规则。如有问题，请联系 <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>。</p>
      </article>
    </Modal>
  )
}

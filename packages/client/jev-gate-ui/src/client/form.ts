/**
 * 卡片暂存表单：本插件自有的最小复刻（bundle 纯净门禁止跨插件值引用，
 * 不能 import ui-settings-plugins 的 card-form.ts——语义对齐其 staged 模型）。
 *
 * 暂存用户输入、保存时才写：settings 的每次写都是持久化、revision 围栏的
 * 文档变更，控件沉降即提交会把一次编辑变成用户没请求过的写。字段展示
 * 有效值（user 层覆盖 composition 层覆盖 schema 默认），「user 层是否带
 * 这个键」标记覆盖——与取值比较无关，等于默认值的覆盖仍是覆盖。
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'

/** 保存时一个字段的暂存文本要执行的写。 */
export type FieldWrite =
  | { kind: 'set'; value: unknown }
  | { kind: 'clear' }

/** 一个字段在存储值与草稿文本间的双向转换。 */
export interface CardFieldSpec {
  /** namespace 段内的字段名。 */
  field: string
  /** 存储值 → 草稿文本；段里没有该值时为空串。 */
  format: (value: unknown) => string
  /** 草稿文本 → 写；不接受该值时返回 undefined（阻止保存，而不是丢弃编辑）。 */
  parse: (text: string) => FieldWrite | undefined
}

/** 控件渲染所需的字段状态。 */
export interface CardFieldState {
  /** 控件渲染的草稿文本。 */
  text: string
  /** 保存后 user 层是否留有该字段。 */
  overridden: boolean
  /** 草稿不是该字段接受的值，阻止保存。 */
  invalid: boolean
}

/** 每张卡片共享的表单状态。 */
export interface CardShell {
  /** namespace 未服务给本客户端时为 false，卡片渲染为空。 */
  available: boolean
  /** Host 文档是否接受写。 */
  writable: boolean
  /** 表单是否持有保存会写入的编辑。 */
  dirty: boolean
  /** 是否有非法草稿，阻止保存。 */
  invalid: boolean
  /** 保存是否正在跨线。 */
  saving: boolean
  /** 上次保存未按暂存落地；下次编辑或保存时清除。 */
  failed: boolean
}

/** 每张卡片的槽位注册注入的写动作。 */
export interface CardActions {
  /** 暂存一个字段的草稿文本。 */
  edit: (field: string, text: string) => void
  /** 暂存清除，保存后该字段恢复继承 composition 层。 */
  resetField: (field: string) => void
  /** 写入全部暂存编辑，然后按 Host 接受的结果重新播种。 */
  save: () => void
  /** 丢弃全部暂存编辑。 */
  discard: () => void
}

/** 一个字段的暂存编辑。 */
interface StagedEdit {
  text: string
  clear: boolean
}

interface PlannedWrite {
  field: string
  run: (() => Promise<boolean>) | undefined
}

/** 整数/数值字段。空草稿清除；非空非数阻止保存。 */
export function numberField(field: string): CardFieldSpec {
  return {
    field,
    format: value => typeof value === 'number' ? String(value) : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? { kind: 'set', value: parsed } : undefined
    },
  }
}

/** 自由文本字段。空草稿 = 清除（清空控件再保存就是恢复默认）。 */
export function textField(field: string): CardFieldSpec {
  return {
    field,
    format: value => typeof value === 'string' ? value : '',
    parse: (text) => {
      const trimmed = text.trim()
      return trimmed === '' ? { kind: 'clear' } : { kind: 'set', value: trimmed }
    },
  }
}

/** 枚举字段（下拉）。空草稿清除；不在选项内阻止保存。 */
export function choiceField(field: string, choices: readonly string[]): CardFieldSpec {
  return {
    field,
    format: value => typeof value === 'string' ? value : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      return choices.includes(trimmed) ? { kind: 'set', value: trimmed } : undefined
    },
  }
}

/** 布尔字段（开/关下拉，草稿文本 'true'/'false'）。 */
export function booleanField(field: string): CardFieldSpec {
  return {
    field,
    format: value => typeof value === 'boolean' ? String(value) : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      if (trimmed === 'true') return { kind: 'set', value: true }
      if (trimmed === 'false') return { kind: 'set', value: false }
      return undefined
    },
  }
}

/** 字符串数组字段（逗号分隔编辑）。 */
export function listField(field: string): CardFieldSpec {
  return {
    field,
    format: value => Array.isArray(value) ? value.join(', ') : '',
    parse: (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return { kind: 'clear' }
      return { kind: 'set', value: trimmed.split(',').map(part => part.trim()).filter(part => part !== '') }
    },
  }
}

/**
 * 一张卡片在一个 settings namespace 上的暂存；保存时才写。
 * 经快照存储发布：槽位组件经选择器读，scope 与本地草稿都在底下变化，
 * 每次投影都从两者重建。
 */
export class CardForm<T> {
  private readonly specs: Map<string, CardFieldSpec>
  private readonly staged = new Map<string, StagedEdit>()
  private readonly listeners = new Set<() => void>()
  private saving = false
  private failed = false

  constructor(
    private readonly scope: SettingsScope<T>,
    specs: CardFieldSpec[],
  ) {
    this.specs = new Map(specs.map(spec => [spec.field, spec]))
    scope.subscribe(() => { this.publish() })
  }

  /** 发布投影：scope 或草稿变化时重建。 */
  bind<S>(project: () => S): SnapshotStore<S> {
    const store = createSnapshotStore(project())
    this.listeners.add(() => { store.set(project()) })
    return store
  }

  /** 卡片级状态。 */
  shell(): CardShell {
    const snapshot = this.scope.getSnapshot()
    const plan = this.plan()
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: plan.length > 0,
      invalid: plan.some(item => item.run === undefined),
      saving: this.saving,
      failed: this.failed,
    }
  }

  /** 一个控件的状态。 */
  field(field: string): CardFieldState {
    const staged = this.staged.get(field)
    const spec = this.spec(field)
    if (staged === undefined) {
      return { text: spec.format(this.sectionValue(field)), overridden: this.stored(field), invalid: false }
    }
    const write = staged.clear ? { kind: 'clear' as const } : spec.parse(staged.text)
    return {
      text: staged.text,
      overridden: write?.kind === 'set',
      invalid: write === undefined,
    }
  }

  /** edit/reset/save/discard 动作。 */
  actions(): CardActions {
    return {
      edit: (field, text) => { this.stage(field, { text, clear: false }) },
      resetField: (field) => {
        this.stage(field, { text: this.spec(field).format(this.baseValue(field)), clear: true })
      },
      save: () => { void this.save() },
      discard: () => {
        if (this.staged.size === 0 && !this.failed) return
        this.staged.clear()
        this.failed = false
        this.publish()
      },
    }
  }

  /**
   * 写入全部暂存编辑，再按 Host 接受的结果重新播种。
   * Host 是是否接受的唯一权威（schema 表达不了的约束在它的校验里），
   * 所以结果从段里回读而不是在此预测；未落地的保存保留草稿供修正。
   */
  async save(): Promise<void> {
    const plan = this.plan()
    const writes = plan.flatMap(item => item.run === undefined ? [] : [item.run])
    if (plan.length === 0 || this.saving || writes.length !== plan.length) return
    this.saving = true
    this.failed = false
    this.publish()
    let landed = true
    for (const write of writes) {
      landed = await write() && landed
    }
    if (landed) this.staged.clear()
    this.saving = false
    this.failed = !landed
    this.publish()
  }

  /** 保存将写入的全部暂存编辑；非法草稿不带 run：表单仍 dirty，保存拒绝。 */
  private plan(): PlannedWrite[] {
    const plan: PlannedWrite[] = []
    for (const [field, staged] of this.staged) {
      const spec = this.spec(field)
      if (staged.clear) {
        if (this.stored(field)) plan.push({ field, run: () => this.clear(field) })
        continue
      }
      if (staged.text === spec.format(this.sectionValue(field))) continue
      const write = spec.parse(staged.text)
      if (write === undefined) plan.push({ field, run: undefined })
      else if (write.kind === 'clear') plan.push({ field, run: () => this.clear(field) })
      else plan.push({ field, run: () => this.store(field, write.value) })
    }
    return plan
  }

  private async clear(field: string): Promise<boolean> {
    await this.scope.unset(field)
    return !this.stored(field)
  }

  private async store(field: string, value: unknown): Promise<boolean> {
    await this.scope.set(field, value)
    return this.userLayer()?.[field] === value
  }

  private stage(field: string, edit: StagedEdit): void {
    this.staged.set(field, edit)
    this.failed = false
    this.publish()
  }

  private spec(field: string): CardFieldSpec {
    const spec = this.specs.get(field)
    if (spec === undefined) throw new Error(`jev-gate card has no field ${field}`)
    return spec
  }

  private snapshotOf(): SettingsScopeSnapshot<T> {
    return this.scope.getSnapshot()
  }

  private sectionValue(field: string): unknown {
    return (this.snapshotOf().value as Record<string, unknown> | undefined)?.[field]
  }

  private baseValue(field: string): unknown {
    return (this.snapshotOf().base as Record<string, unknown> | undefined)?.[field]
  }

  private userLayer(): Record<string, unknown> | undefined {
    return this.snapshotOf().user as Record<string, unknown> | undefined
  }

  private stored(field: string): boolean {
    const user = this.userLayer()
    return user !== undefined && Object.hasOwn(user, field)
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}

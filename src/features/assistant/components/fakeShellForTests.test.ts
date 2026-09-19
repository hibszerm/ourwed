/**
 * Minimal HTMLElement stand-in for node vitest (no jsdom/happy-dom).
 * Enough for applyAssistantMobileViewportToElement.
 */

export type FakeShell = HTMLElement & {
  __vars: Map<string, string>
  __attrs: Map<string, string>
  __style: Record<string, string>
  __children: FakeShell[]
  __tag: string
}

export function createFakeShell(): FakeShell {
  const vars = new Map<string, string>()
  const attrs = new Map<string, string>()
  const styleBag: Record<string, string> = {}
  const children: FakeShell[] = []

  const style = {
    setProperty(k: string, v: string) {
      vars.set(k, v)
    },
    getPropertyValue(k: string) {
      return vars.get(k) ?? ''
    },
    removeProperty(k: string) {
      vars.delete(k)
      delete styleBag[k]
    },
  } as CSSStyleDeclaration

  Object.defineProperties(style, {
    top: {
      get: () => styleBag.top ?? '',
      set: (v: string) => {
        styleBag.top = v
      },
      enumerable: true,
    },
    left: {
      get: () => styleBag.left ?? '',
      set: (v: string) => {
        styleBag.left = v
      },
      enumerable: true,
    },
    width: {
      get: () => styleBag.width ?? '',
      set: (v: string) => {
        styleBag.width = v
      },
      enumerable: true,
    },
    height: {
      get: () => styleBag.height ?? '',
      set: (v: string) => {
        styleBag.height = v
      },
      enumerable: true,
    },
    right: {
      get: () => styleBag.right ?? '',
      set: (v: string) => {
        styleBag.right = v
      },
      enumerable: true,
    },
    bottom: {
      get: () => styleBag.bottom ?? '',
      set: (v: string) => {
        styleBag.bottom = v
      },
      enumerable: true,
    },
    inset: {
      get: () => styleBag.inset ?? '',
      set: (v: string) => {
        styleBag.inset = v
      },
      enumerable: true,
    },
    position: {
      get: () => styleBag.position ?? '',
      set: (v: string) => {
        styleBag.position = v
      },
      enumerable: true,
    },
  })

  const el = {
    __vars: vars,
    __attrs: attrs,
    __style: styleBag,
    __children: children,
    style,
    setAttribute(k: string, v: string) {
      attrs.set(k, v)
    },
    getAttribute(k: string) {
      return attrs.has(k) ? attrs.get(k)! : null
    },
    removeAttribute(k: string) {
      attrs.delete(k)
    },
    querySelector(sel: string) {
      if (sel.includes('[role="dialog"]') || sel.includes('role')) {
        return children.find((c) => c.getAttribute('role') === 'dialog') ?? null
      }
      if (sel.includes('textarea')) {
        return children.find((c) => c.__tag === 'textarea') ?? null
      }
      return null
    },
    appendChild(child: FakeShell) {
      children.push(child)
      return child
    },
    contains(node: unknown) {
      return children.includes(node as FakeShell) || node === el
    },
    __tag: 'div',
  }

  return el as unknown as FakeShell
}

export function createFakeTextarea(): FakeShell {
  const el = createFakeShell()
  ;(el as FakeShell & { __tag: string }).__tag = 'textarea'
  return el
}

export function createFakePanel(): FakeShell {
  const el = createFakeShell()
  el.setAttribute('role', 'dialog')
  return el
}

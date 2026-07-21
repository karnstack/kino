import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"

// A tiny History-API router — enough for a five-page docs site, no dependency.
// Production deep links rely on the Worker's single-page-application fallback
// (see wrangler.jsonc); the Vite dev server already serves index.html for any
// path.

type RouterValue = { path: string; navigate: (to: string) => void }
const RouterContext = createContext<RouterValue>({
  path: "/",
  navigate: () => {},
})

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  )

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  const navigate = useCallback((to: string) => {
    if (to === window.location.pathname) return
    window.history.pushState({}, "", to)
    setPath(to)
    window.scrollTo({ top: 0 })
  }, [])

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  )
}

export function useRouter(): RouterValue {
  return useContext(RouterContext)
}

type LinkProps = {
  to: string
  className?: string
  activeClassName?: string
  children: ReactNode
  "aria-label"?: string
  onNavigate?: () => void
}

// Internal navigation link. Falls back to default browser behavior for
// modified clicks (new tab, etc.) so it behaves like a real <a>.
export function Link({
  to,
  className,
  activeClassName,
  children,
  onNavigate,
  ...rest
}: LinkProps) {
  const { path, navigate } = useRouter()
  const active = path === to
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
      return
    e.preventDefault()
    navigate(to)
    onNavigate?.()
  }
  return (
    <a
      href={to}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[className, active ? activeClassName : null]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </a>
  )
}

import { useEffect, useState, type ReactNode } from "react"
import { Link, useRouter } from "./router"
import { KinoLogo, KinoMark } from "./logo"
import { GitHubIcon, MenuIcon, CloseIcon } from "./icons"
import { TouchTarget } from "./ui"

const GITHUB_URL = "https://github.com/karnstack/kino"
const NPM_URL = "https://www.npmjs.com/package/@karnstack/kino"

const NAV = [
  {
    group: "Get started",
    items: [
      { to: "/", label: "Overview" },
      { to: "/install", label: "Install & API" },
    ],
  },
  {
    group: "Guides",
    items: [
      { to: "/providers", label: "Providers" },
      { to: "/scene-protocol", label: "Scene protocol" },
      { to: "/theming", label: "Theming" },
    ],
  },
] as const

export function DocsLayout({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const { path } = useRouter()

  // Close the mobile nav whenever the route changes.
  useEffect(() => setNavOpen(false), [path])

  return (
    <div className="isolate flex min-h-dvh flex-col">
      <Header onOpenNav={() => setNavOpen(true)} />
      {navOpen && <MobileNav onClose={() => setNavOpen(false)} />}
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
          <Sidebar />
          <main className="min-w-0 py-10 lg:py-16">{children}</main>
        </div>
      </div>
      <Footer />
    </div>
  )
}

function Header({ onOpenNav }: { onOpenNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Homepage" className="shrink-0">
          <KinoLogo />
        </Link>
        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          <a
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden h-8 items-center rounded-full bg-white/5 px-3 font-mono text-[0.8125rem] text-paper-dim ring-1 ring-white/10 transition-colors hover:text-paper sm:inline-flex"
          >
            v{__KINO_VERSION__}
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="kino on GitHub"
            className="relative grid size-9 place-items-center rounded-lg text-paper-dim transition-colors hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader"
          >
            <GitHubIcon className="size-5" />
            <TouchTarget />
          </a>
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="relative grid size-9 place-items-center rounded-lg text-paper-dim transition-colors hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leader lg:hidden"
          >
            <MenuIcon className="size-6" />
            <TouchTarget />
          </button>
        </div>
      </div>
    </header>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-7">
      {NAV.map((section) => (
        <div key={section.group} className="flex flex-col gap-1.5">
          <p className="px-3 font-mono text-[0.75rem] tracking-wide text-paper-faint uppercase">
            {section.group}
          </p>
          <ul role="list" className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onNavigate={onNavigate}
                  className="relative flex items-center rounded-lg px-3 py-2 text-base font-medium text-paper-dim transition-colors hover:bg-white/5 hover:text-paper sm:text-sm aria-[current=page]:bg-white/6 aria-[current=page]:text-paper"
                  activeClassName="before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-leader"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Sidebar() {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 py-16">
        <NavList />
      </div>
    </aside>
  )
}

function MobileNav({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-8 overflow-y-auto border-r border-white/8 bg-ink-raised p-6">
        <div className="flex items-center justify-between">
          <KinoLogo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="relative grid size-9 place-items-center rounded-lg text-paper-dim transition-colors hover:bg-white/5 hover:text-paper"
          >
            <CloseIcon className="size-6" />
            <TouchTarget />
          </button>
        </div>
        <NavList onNavigate={onClose} />
      </div>
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-7 place-items-center rounded-lg bg-leader text-ink">
            <KinoMark className="size-4" />
          </span>
          <p className="text-sm text-paper-dim">
            <span className="font-display font-semibold text-paper">kino</span>{" "}
            — a themeable React video player. MIT licensed.
          </p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="font-normal text-paper-dim transition-colors hover:text-paper"
          >
            GitHub
          </a>
          <a
            href={NPM_URL}
            target="_blank"
            rel="noreferrer"
            className="font-normal text-paper-dim transition-colors hover:text-paper"
          >
            npm
          </a>
          <a
            href="/llms.txt"
            className="font-normal text-paper-dim transition-colors hover:text-paper"
          >
            llms.txt
          </a>
        </div>
      </div>
    </footer>
  )
}

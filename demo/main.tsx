import { createRoot } from "react-dom/client"
import { RouterProvider, useRouter } from "./router"
import { DocsLayout } from "./shell"
import { OverviewPage } from "./pages/overview"
import { ProvidersPage } from "./pages/providers"
import { ScenesPage } from "./pages/scenes"
import { ThemingPage } from "./pages/theming"
import { InstallPage } from "./pages/install"
import { btnPrimary, Eyebrow } from "./ui"
import { usePageMeta } from "./seo"
import "../src/styles/kino.css"
import "./styles.css"

function Routes() {
  const { path } = useRouter()
  usePageMeta(path)
  switch (path) {
    case "/providers":
      return <ProvidersPage />
    // Not "/scenes": the static demo page scenes.html shadows that path in
    // both dev (Vite html resolution) and production (asset html_handling
    // runs before the SPA fallback).
    case "/scene-protocol":
      return <ScenesPage />
    case "/theming":
      return <ThemingPage />
    case "/install":
      return <InstallPage />
    case "/":
      return <OverviewPage />
    default:
      return <NotFound />
  }
}

function NotFound() {
  const { navigate } = useRouter()
  return (
    <div className="flex flex-col items-start gap-6 py-10">
      <Eyebrow>404</Eyebrow>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-paper sm:text-5xl">
        This reel is missing.
      </h1>
      <p className="max-w-[48ch] text-lg/8 text-pretty text-paper-dim">
        That page rolled off the end of the spool. Head back to the start.
      </p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className={btnPrimary}
      >
        Back to overview
      </button>
    </div>
  )
}

function App() {
  return (
    <RouterProvider>
      <DocsLayout>
        <Routes />
      </DocsLayout>
    </RouterProvider>
  )
}

const rootEl = document.getElementById("root")
if (!rootEl) throw new Error("#root not found")
createRoot(rootEl).render(<App />)

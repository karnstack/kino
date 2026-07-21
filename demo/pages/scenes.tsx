import { Code, CodeBlock, Eyebrow, PageHeader, Table } from "../ui"
import { Link } from "../router"

const MANIFEST_TYPES = `type SceneManifestScene = {
  id: string
  // Module URL resolving to { default: React.ComponentType }.
  // Absolute, or relative to the manifest URL.
  src: string
  // Global sequence seconds. end includes the trailing silence
  // gap, during which the scene holds its final settled state.
  start: number
  end: number
  cues: Cues
}

type SceneManifest = {
  version: 1
  slug: string
  title?: string
  duration: number
  scenes: SceneManifestScene[]
  audio: Array<{ bitrate: number; src: string }>
  captions?: string
  // Thumbnail VTT whose cues point into a sprite image via #xywh
  // fragments — the Mux storyboard format. Consumed by the
  // embedding player for scrubber previews, not by the host.
  storyboard?: string
  chapters?: Array<{ id: string; title: string; start: number }>
}`

const WIRE_TYPES = `// Parent -> host.
type HostCommand =
  | {
      type: "kino:init"
      rate: number
      volume: number
      muted: boolean
      autoPlay: boolean
      // Resume point in global seconds, used after a pip reload.
      startTime?: number
    }
  | { type: "kino:play" }
  | { type: "kino:pause" }
  | { type: "kino:seek"; time: number }
  | { type: "kino:setRate"; rate: number }
  | { type: "kino:setVolume"; volume: number }
  | { type: "kino:setMuted"; muted: boolean }

// Host -> parent.
type HostEvent =
  | { type: "kino:ready"; duration: number }
  | { type: "kino:state"; state: HostMediaState }
  | { type: "kino:scenechange"; id: string }
  | { type: "kino:error"; code: string; message: string }`

const HOST_SNIPPET = `import { createSceneHost } from "@karnstack/kino/scenes"

const manifest = await fetch("./manifest.json").then((r) => r.json())

createSceneHost({
  container: document.getElementById("stage")!,
  manifest,
  loadScene: (id) => import(\`./scenes/\${id}.tsx\`),
  // Lock incoming commands to the embedding page's origin.
  parentOrigin: "https://example.com",
})`

const SCENE_SNIPPET = `import { useSceneTimeline } from "@karnstack/kino/scenes"

// A scene module default-exports one component and reads the clock.
export default function Intro() {
  const clock = useSceneTimeline()
  return (
    <div style={{ opacity: clock.cue("title") ? 1 : 0 }}>
      <h1>Not a video file</h1>
      <progress value={clock.progress()} />
    </div>
  )
}`

const EMBED_SNIPPET = `import { ScenesPlayer } from "@karnstack/kino/scenes"

<ScenesPlayer
  src="https://scenes.example.com/intro.html?token=…"
  captions={{ src: "/intro.vtt", label: "English", srclang: "en" }}
  storyboard={{ vttUrl: "/intro-storyboard.vtt" }}
/>`

type WireRow = { message: string; direction: string; meaning: string }

const WIRE_ROWS: WireRow[] = [
  {
    message: "kino:init",
    direction: "parent → host",
    meaning:
      "Sent once in reply to ready. Applies rate, volume, muted, and autoplay; the optional startTime resumes playback after a pip reload.",
  },
  {
    message: "kino:play / kino:pause",
    direction: "parent → host",
    meaning: "Transport.",
  },
  {
    message: "kino:seek",
    direction: "parent → host",
    meaning: "Absolute position in global sequence seconds.",
  },
  {
    message: "kino:setRate / setVolume / setMuted",
    direction: "parent → host",
    meaning: "Live playback settings, applied straight to the audio element.",
  },
  {
    message: "kino:ready",
    direction: "host → parent",
    meaning:
      "The host mounted and knows the sequence duration. Opens the handshake.",
  },
  {
    message: "kino:state",
    direction: "host → parent",
    meaning:
      "A full HostMediaState snapshot — ~10 Hz while playing, and immediately on every transition.",
  },
  {
    message: "kino:scenechange",
    direction: "host → parent",
    meaning: "The active scene changed; carries the new scene id.",
  },
  {
    message: "kino:error",
    direction: "host → parent",
    meaning:
      'code is "media" (the audio failed) or "scene" (a module failed to load), plus a message.',
  },
]

const markdown = `# The scene protocol.

A scene sequence is one audio file plus React scene modules mapped onto its timeline. The protocol has two halves: a JSON manifest that describes the sequence, and a postMessage wire format that lets the embedding player drive the iframe host.

## Two documents, one clock

A sequence spans two documents. The host page runs inside an iframe and owns everything that plays: the audio element and the scene DOM, wired up with \`createSceneHost\`. The embedding page renders \`ScenesPlayer\`, whose provider speaks the wire format and adapts it to kino's Provider contract — so scenes get the same chrome, keyboard map, and captions menu as every other provider.

The audio element is the master clock. Scenes never own time; they render as pure functions of it, which is why seeking in either direction always settles correctly. The host page can live on any origin, with auth tokens already encoded into its URL by the caller.

## The manifest

One JSON file describes the sequence: which scene module owns which time range, plus the audio sources and optional sidecars.

\`\`\`ts
${MANIFEST_TYPES}
\`\`\`

Scenes tile the sequence clock: each range is [start, end) in global seconds, and every end must equal the next scene's start — the host warns at startup listing any gap or overlap. \`end\` includes the trailing silence after a scene's narration, during which the scene holds its final settled state. \`captions\` and \`storyboard\` are sidecars for the embedding player, not the host: captions are a plain VTT rendered by kino's chrome, and the storyboard is a thumbnail VTT whose cues point into a sprite image via #xywh fragments, the same format as the Mux storyboard track.

## The wire format

Both directions travel over postMessage with types namespaced \`kino:\`, so a host page can share its window with unrelated message traffic.

\`\`\`ts
${WIRE_TYPES}
\`\`\`

| Message | Direction | Meaning |
| --- | --- | --- |
${WIRE_ROWS.map((r) => `| \`${r.message}\` | ${r.direction} | ${r.meaning} |`).join("\n")}

The handshake: the host posts \`kino:ready\` once it has mounted, the parent replies with \`kino:init\`, and from then on commands flow one way and state the other. State ticks at ~10 Hz while playing and immediately on every transition — enough precision for caption sync and the scrubber. The host's snapshot is authoritative; the provider only holds an optimistic rate while a setRate is in flight, until the host echoes it back.

## Trust boundaries

Both sides check origin and source, and the \`kino:\` prefix is a namespace, not a defense. The parent accepts an event only if it arrives from the host's origin and its source is the sequence iframe's window. The host accepts a command only if its origin matches \`parentOrigin\` (the default \`"*"\` accepts any parent — lock it down in production) and its source is the parent window or the parent's opener; the opener case exists because inside a document picture-in-picture window the host's parent is the pip window itself, while commands still originate from the main tab.

## The host page

\`createSceneHost\` owns the stage. Give it a container, the manifest, and a \`loadScene\` function that resolves a scene id to its module.

\`\`\`ts
${HOST_SNIPPET}
\`\`\`

Scenes are authored against a fixed 1920×1080 stage that the host transform-scales to the iframe viewport, so output is resolution independent. Modules are cached after first load and the next scene preloads while the current one plays; a module that fails to load is memoized as failed and reported once as \`kino:error\`. The \`onSeekingChange\` hook exists so the host bundle can flip its animation library into skip-animations mode while scrubbing — kino itself stays motion-agnostic.

## Inside a scene

A scene is a pure function of time. \`useSceneTimeline()\` returns a scene-local clock: \`t\`, \`duration\`, the scene's \`cues\`, and the helpers \`cue(id)\`, \`between(from, to)\`, \`progress()\`, and \`currentWord()\`. Cues are authored from whisper word timings, so visuals land on the exact word that names them.

\`\`\`tsx
${SCENE_SNIPPET}
\`\`\`

The local clock is clamped to the narration length, so during the trailing silence gap the scene holds its settled state instead of running past its cues.

## The embedding side

\`ScenesPlayer\` wraps the provider in kino's glass chrome. Pass the host page URL as \`src\` with any auth token already encoded; captions and the storyboard load on the parent side.

\`\`\`tsx
${EMBED_SNIPPET}
\`\`\`

The stage is resolution-independent DOM, so there is no rendition ladder and no quality menu. Picture-in-picture uses the Document Picture-in-Picture API where it exists; presentation details live on the Providers page (https://kino.karnstack.com/providers).`

export function ScenesPage() {
  return (
    <div className="flex flex-col gap-16">
      <PageHeader
        eyebrow="Scenes"
        title="The scene protocol."
        lead="A scene sequence is one audio file plus React scene modules mapped onto its timeline. The protocol has two halves: a JSON manifest that describes the sequence, and a postMessage wire format that lets the embedding player drive the iframe host."
        markdown={markdown}
      />

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>Architecture</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Two documents, one clock.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            A sequence spans two documents. The host page runs inside an iframe
            and owns everything that plays: the audio element and the scene DOM,
            wired up with <Code>createSceneHost</Code>. The embedding page
            renders <Code>ScenesPlayer</Code>, whose provider speaks the wire
            format and adapts it to kino&apos;s Provider contract — so scenes
            get the same chrome, keyboard map, and captions menu as every other
            provider.
          </p>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            The audio element is the master clock. Scenes never own time; they
            render as pure functions of it, which is why seeking in either
            direction always settles correctly. The host page can live on any
            origin, with auth tokens already encoded into its URL by the caller.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>The manifest</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            One JSON file describes the sequence.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Scenes tile the sequence clock: each range is [start, end) in global
            seconds, and every <Code>end</Code> must equal the next scene&apos;s{" "}
            <Code>start</Code> — the host warns at startup listing any gap or
            overlap. <Code>end</Code> includes the trailing silence after a
            scene&apos;s narration, during which the scene holds its final
            settled state.
          </p>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            <Code>captions</Code> and <Code>storyboard</Code> are sidecars for
            the embedding player, not the host: captions are a plain VTT
            rendered by kino&apos;s chrome, and the storyboard is a thumbnail
            VTT whose cues point into a sprite image via #xywh fragments, the
            same format as the Mux storyboard track.
          </p>
        </div>
        <CodeBlock code={MANIFEST_TYPES} label="scenes/protocol.ts" lang="ts" />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>The wire format</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Namespaced messages over postMessage.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Both directions travel over <Code>postMessage</Code> with types
            namespaced <Code>kino:</Code>, so a host page can share its window
            with unrelated message traffic. The handshake: the host posts{" "}
            <Code>kino:ready</Code> once it has mounted, the parent replies with{" "}
            <Code>kino:init</Code>, and from then on commands flow one way and
            state the other.
          </p>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            State ticks at ~10 Hz while playing and immediately on every
            transition — enough precision for caption sync and the scrubber. The
            host&apos;s snapshot is authoritative; the provider only holds an
            optimistic rate while a setRate is in flight, until the host echoes
            it back.
          </p>
        </div>
        <CodeBlock code={WIRE_TYPES} label="scenes/protocol.ts" lang="ts" />
        <Table
          head={["Message", "Direction", "Meaning"]}
          rows={WIRE_ROWS.map((r) => ({
            key: r.message,
            cells: [r.message, r.direction, r.meaning],
          }))}
        />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>Trust boundaries</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Both sides check origin and source.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            The <Code>kino:</Code> prefix is a namespace, not a defense. The
            parent accepts an event only if it arrives from the host&apos;s
            origin and its source is the sequence iframe&apos;s window. The host
            accepts a command only if its origin matches{" "}
            <Code>parentOrigin</Code> (the default <Code>&quot;*&quot;</Code>{" "}
            accepts any parent — lock it down in production) and its source is
            the parent window or the parent&apos;s opener.
          </p>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            The opener case exists because inside a document picture-in-picture
            window the host&apos;s parent is the pip window itself, while
            commands still originate from the main tab — which is the pip
            window&apos;s opener.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>The host page</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            createSceneHost owns the stage.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Give it a container, the manifest, and a <Code>loadScene</Code>{" "}
            function that resolves a scene id to its module. Scenes are authored
            against a fixed 1920×1080 stage that the host transform-scales to
            the iframe viewport, so output is resolution independent.
          </p>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            Modules are cached after first load and the next scene preloads
            while the current one plays; a module that fails to load is memoized
            as failed and reported once as <Code>kino:error</Code>. The{" "}
            <Code>onSeekingChange</Code> hook exists so the host bundle can flip
            its animation library into skip-animations mode while scrubbing —
            kino itself stays motion-agnostic.
          </p>
        </div>
        <CodeBlock code={HOST_SNIPPET} label="host page" lang="ts" />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>Inside a scene</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            A scene is a pure function of time.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            <Code>useSceneTimeline()</Code> returns a scene-local clock:{" "}
            <Code>t</Code>, <Code>duration</Code>, the scene&apos;s{" "}
            <Code>cues</Code>, and the helpers <Code>cue(id)</Code>,{" "}
            <Code>between(from, to)</Code>, <Code>progress()</Code>, and{" "}
            <Code>currentWord()</Code>. Cues are authored from whisper word
            timings, so visuals land on the exact word that names them.
          </p>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            The local clock is clamped to the narration length, so during the
            trailing silence gap the scene holds its settled state instead of
            running past its cues.
          </p>
        </div>
        <CodeBlock code={SCENE_SNIPPET} label="scenes/intro.tsx" lang="tsx" />
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Eyebrow>The embedding side</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            One component, the usual chrome.
          </h2>
          <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
            <Code>ScenesPlayer</Code> wraps the provider in kino&apos;s glass
            chrome. Pass the host page URL as <Code>src</Code> with any auth
            token already encoded; captions and the storyboard load on the
            parent side. The stage is resolution-independent DOM, so there is no
            rendition ladder and no quality menu. Picture-in-picture and
            fullscreen behavior live on the{" "}
            <Link
              to="/providers"
              className="font-medium text-leader transition-colors hover:text-leader-deep"
            >
              Providers page
            </Link>
            .
          </p>
        </div>
        <CodeBlock code={EMBED_SNIPPET} label="embed.tsx" lang="tsx" />
      </section>
    </div>
  )
}

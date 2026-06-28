import {
  Code,
  CodeBlock,
  Eyebrow,
  InstallCommand,
  PageHeader,
  Table,
} from "../ui"

const MUX_SNIPPET = `import { MuxPlayer } from "@karnstack/kino/mux"
import "@karnstack/kino/styles.css"

export function Clip() {
  return (
    <div style={{ aspectRatio: "16 / 9" }}>
      <MuxPlayer
        playbackId="your-playback-id"
        accentColor="oklch(50.8% 0.118 165.612)"
      />
    </div>
  )
}`

const NATIVE_SNIPPET = `import { NativePlayer } from "@karnstack/kino/native"
import "@karnstack/kino/styles.css"

export function Clip() {
  return (
    <div style={{ aspectRatio: "16 / 9" }}>
      <NativePlayer
        src="https://example.com/clip.mp4"
        poster="https://example.com/clip.jpg"
      />
    </div>
  )
}`

const YOUTUBE_SNIPPET = `import { YouTubePlayer } from "@karnstack/kino/youtube"
import "@karnstack/kino/styles.css"

export function Clip() {
  return (
    <div style={{ aspectRatio: "16 / 9" }}>
      <YouTubePlayer videoId="dQw4w9WgXcQ" />
    </div>
  )
}`

const VIMEO_SNIPPET = `import { VimeoPlayer } from "@karnstack/kino/vimeo"
import "@karnstack/kino/styles.css"

export function Clip() {
  return (
    <div style={{ aspectRatio: "16 / 9" }}>
      <VimeoPlayer videoId="291235566" />
    </div>
  )
}`

type Prop = [string, string, string]

const SHARED_PROPS: Prop[] = [
  ["accentColor", "string", "Accent color — any CSS color."],
  [
    "theme",
    "Record<string, string>",
    "Inline CSS custom properties on the root.",
  ],
  ["placeholder", "string", "Blur-up still painted until the poster loads."],
  ["className", "string", "Extra class on the .kino root."],
]

const MUX_PROPS: Prop[] = [
  ["playbackId", "string", "Mux playback id. Required."],
  [
    "tokens",
    "{ playback?, thumbnail?, storyboard? }",
    "Signed-playback tokens, minted server-side.",
  ],
  ["poster", "string", "Override the derived Mux thumbnail."],
  [
    "metadata",
    "{ videoId?, videoTitle?, viewerUserId? }",
    "Mux Data metadata.",
  ],
  ["autoPlay", "boolean", "Start playback on mount."],
  ["defaultRate", "number", "Initial playback rate."],
  ...SHARED_PROPS,
]

const NATIVE_PROPS: Prop[] = [
  ["src", "string", "Raw media URL — mp4, webm, ogg. Required."],
  ["poster", "string", "Poster image URL."],
  ["tracks", "NativeTextTrack[]", "Sidecar subtitle / caption tracks."],
  ["autoPlay", "boolean", "Start playback on mount."],
  ["muted", "boolean", "Start muted."],
  ["loop", "boolean", "Loop playback."],
  ["defaultRate", "number", "Initial playback rate."],
  [
    "crossOrigin",
    '"anonymous" | "use-credentials"',
    "CORS mode for cross-origin media and tracks.",
  ],
  [
    "metadata",
    "{ videoId?, videoTitle?, viewerUserId? }",
    "OS media-session metadata.",
  ],
  ...SHARED_PROPS,
]

const YOUTUBE_PROPS: Prop[] = [
  [
    "videoId",
    "string",
    "Video id or watch / youtu.be / embed / shorts URL. Required.",
  ],
  ["autoPlay", "boolean", "Start playback on mount."],
  ["muted", "boolean", "Start muted."],
  ["loop", "boolean", "Loop playback."],
  ["defaultRate", "number", "Initial playback rate."],
  [
    "metadata",
    "{ videoId?, videoTitle?, viewerUserId? }",
    "OS media-session metadata.",
  ],
  ...SHARED_PROPS,
]

const VIMEO_PROPS: Prop[] = [
  ["videoId", "string", "Vimeo video id or any Vimeo share URL. Required."],
  ["hash", "string", "Privacy hash for unlisted videos."],
  ["autoPlay", "boolean", "Start playback on mount."],
  ["muted", "boolean", "Start muted."],
  ["loop", "boolean", "Loop playback."],
  ["defaultRate", "number", "Initial playback rate."],
  [
    "metadata",
    "{ videoId?, videoTitle?, viewerUserId? }",
    "OS media-session metadata.",
  ],
  ...SHARED_PROPS,
]

const markdown = `# Up and running.

kino is a single package with per-provider entry points. React 19 is a peer dependency; the Mux engine is pulled in transitively, while the native and YouTube providers need nothing extra — YouTube loads the IFrame API at runtime.

## Add the package

\`\`\`bash
pnpm add @karnstack/kino
\`\`\`

Import the stylesheet once with \`import "@karnstack/kino/styles.css"\`, then give the player a sized container — it fills the full width and height of its parent.

## Quick start

### Mux

\`\`\`tsx
${MUX_SNIPPET}
\`\`\`

### Native

\`\`\`tsx
${NATIVE_SNIPPET}
\`\`\`

### YouTube

\`\`\`tsx
${YOUTUBE_SNIPPET}
\`\`\`

### Vimeo

\`\`\`tsx
${VIMEO_SNIPPET}
\`\`\`

## API

### MuxPlayer

| Prop | Type | Description |
|---|---|---|
| playbackId | string | Mux playback id. Required. |
| tokens | { playback?, thumbnail?, storyboard? } | Signed-playback tokens, minted server-side. |
| poster | string | Override the derived Mux thumbnail. |
| metadata | { videoId?, videoTitle?, viewerUserId? } | Mux Data metadata. |
| autoPlay | boolean | Start playback on mount. |
| defaultRate | number | Initial playback rate. |
| accentColor | string | Accent color — any CSS color. |
| theme | Record<string, string> | Inline CSS custom properties on the root. |
| placeholder | string | Blur-up still painted until the poster loads. |
| className | string | Extra class on the .kino root. |

### NativePlayer

| Prop | Type | Description |
|---|---|---|
| src | string | Raw media URL — mp4, webm, ogg. Required. |
| poster | string | Poster image URL. |
| tracks | NativeTextTrack[] | Sidecar subtitle / caption tracks. |
| autoPlay | boolean | Start playback on mount. |
| muted | boolean | Start muted. |
| loop | boolean | Loop playback. |
| defaultRate | number | Initial playback rate. |
| crossOrigin | "anonymous" \\| "use-credentials" | CORS mode for cross-origin media and tracks. |
| metadata | { videoId?, videoTitle?, viewerUserId? } | OS media-session metadata. |
| accentColor | string | Accent color — any CSS color. |
| theme | Record<string, string> | Inline CSS custom properties on the root. |
| placeholder | string | Blur-up still painted until the poster loads. |
| className | string | Extra class on the .kino root. |

### YouTubePlayer

| Prop | Type | Description |
|---|---|---|
| videoId | string | Video id or watch / youtu.be / embed / shorts URL. Required. |
| autoPlay | boolean | Start playback on mount. |
| muted | boolean | Start muted. |
| loop | boolean | Loop playback. |
| defaultRate | number | Initial playback rate. |
| metadata | { videoId?, videoTitle?, viewerUserId? } | OS media-session metadata. |
| accentColor | string | Accent color — any CSS color. |
| theme | Record<string, string> | Inline CSS custom properties on the root. |
| placeholder | string | Blur-up still painted until the poster loads. |
| className | string | Extra class on the .kino root. |

### VimeoPlayer

| Prop | Type | Description |
|---|---|---|
| videoId | string | Vimeo video id or any Vimeo share URL. Required. |
| hash | string | Privacy hash for unlisted videos. |
| autoPlay | boolean | Start playback on mount. |
| muted | boolean | Start muted. |
| loop | boolean | Loop playback. |
| defaultRate | number | Initial playback rate. |
| metadata | { videoId?, videoTitle?, viewerUserId? } | OS media-session metadata. |
| accentColor | string | Accent color — any CSS color. |
| theme | Record<string, string> | Inline CSS custom properties on the root. |
| placeholder | string | Blur-up still painted until the poster loads. |
| className | string | Extra class on the .kino root. |`

const propRows = (props: Prop[]) =>
  props.map(([name, type, desc]) => ({
    key: name,
    cells: [name, <Code key="t">{type}</Code>, desc],
  }))

export function InstallPage() {
  return (
    <div className="flex flex-col gap-16">
      <PageHeader
        eyebrow="Install"
        title="Up and running."
        lead="kino is a single package with per-provider entry points. React 19 is a peer dependency; the Mux engine is pulled in transitively, while the native and YouTube providers need nothing extra — YouTube loads the IFrame API at runtime."
        markdown={markdown}
      />

      <section className="flex flex-col gap-6">
        <Eyebrow>Add the package</Eyebrow>
        <InstallCommand />
        <p className="max-w-[60ch] text-base/7 text-pretty text-paper-dim">
          Import the stylesheet once with{" "}
          <Code>{'import "@karnstack/kino/styles.css"'}</Code>, then give the
          player a sized container — it fills the full width and height of its
          parent.
        </p>
      </section>

      <section className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <Eyebrow>Quick start</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Pick a provider and play.
          </h2>
        </div>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-paper">Mux</h3>
            <CodeBlock code={MUX_SNIPPET} label="mux.tsx" />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-paper">Native</h3>
            <CodeBlock code={NATIVE_SNIPPET} label="native.tsx" />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-paper">YouTube</h3>
            <CodeBlock code={YOUTUBE_SNIPPET} label="youtube.tsx" />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="text-lg font-medium text-paper">Vimeo</h3>
            <CodeBlock code={VIMEO_SNIPPET} label="vimeo.tsx" />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-10">
        <div className="flex flex-col gap-4">
          <Eyebrow>API</Eyebrow>
          <h2 className="max-w-[28ch] font-display text-3xl font-semibold tracking-tight text-balance text-paper">
            Props, in full.
          </h2>
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="font-mono text-sm tracking-wide text-paper-faint uppercase">
            MuxPlayer
          </h3>
          <Table
            head={["Prop", "Type", "Description"]}
            rows={propRows(MUX_PROPS)}
          />
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="font-mono text-sm tracking-wide text-paper-faint uppercase">
            NativePlayer
          </h3>
          <Table
            head={["Prop", "Type", "Description"]}
            rows={propRows(NATIVE_PROPS)}
          />
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="font-mono text-sm tracking-wide text-paper-faint uppercase">
            YouTubePlayer
          </h3>
          <Table
            head={["Prop", "Type", "Description"]}
            rows={propRows(YOUTUBE_PROPS)}
          />
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="font-mono text-sm tracking-wide text-paper-faint uppercase">
            VimeoPlayer
          </h3>
          <Table
            head={["Prop", "Type", "Description"]}
            rows={propRows(VIMEO_PROPS)}
          />
        </div>
      </section>
    </div>
  )
}

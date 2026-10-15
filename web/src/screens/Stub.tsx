// Placeholder routes for screens outside the core flow (story mode, reverse search, About). Lazy-loaded so they cost nothing up front.
const COPY: Record<string, { title: string; body: string }> = {
  story: { title: 'Story mode', body: 'A guided walk through one Moon target is coming in a later release.' },
  reverse: { title: 'Reverse search', body: 'Pick an Earth place and see which Moon and Mars targets it is most like. Coming in a later release.' },
  about: { title: 'About Analog Portfolio', body: 'Methods, data sources and the validation results will live here. Coming in a later release.' },
}

export default function Stub({ view, onBack }: { view: string; onBack: () => void }) {
  const c = COPY[view] ?? COPY.about
  return (
    <main id="main" className="stub">
      <h1 className="t-h1">{c.title}</h1>
      <p className="t-bodyLg muted2">{c.body}</p>
      <button type="button" className="btn btn-primary" onClick={onBack}>Back to the start</button>
    </main>
  )
}

// A tiny app-wide toast channel, so deep components (the mic, a sheet) can tell the user what
// happened without threading callbacks through every screen. App.tsx renders the toast.
type Listener = (text: string) => void;
const listeners = new Set<Listener>();

export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function toast(text: string) {
  listeners.forEach((l) => l(text));
}

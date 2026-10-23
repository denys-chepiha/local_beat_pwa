// Components
import { MusicIcon, BookIcon, VideoIcon } from '@/components/Icons'
// Services
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore, sectionOfScreen } from '@/store/useUiStore'
// Types
import type { AppSection } from '@/store/useUiStore'

const SECTIONS = [
  { id: 'music', label: 'Music', Icon: MusicIcon },
  { id: 'audiobooks', label: 'Audio Books', Icon: BookIcon },
  { id: 'reader', label: 'Reader', Icon: BookIcon },
  { id: 'video', label: 'Video', Icon: VideoIcon },
] as const

export default function SectionSwitcher() {
  const screen = useUiStore((s) => s.screen)
  const switchSection = useUiStore((s) => s.switchSection)
  const section = sectionOfScreen(screen)
  const selectSection = (next: AppSection) => {
    if (next === section) return
    usePlayerStore.getState().pause()
    switchSection(next)
    if (next === 'music' || next === 'audiobooks') void usePlayerStore.getState().restoreSource(next === 'music' ? 'music' : 'audiobook')
  }
  return <nav className="section-switcher" aria-label="App section">{SECTIONS.map(({ id, label, Icon }) => <button key={id} type="button" className={`section-tab${section === id ? ' active' : ''}`} aria-pressed={section === id} onClick={() => selectSection(id)}><Icon width={16} height={16} />{label}</button>)}</nav>
}

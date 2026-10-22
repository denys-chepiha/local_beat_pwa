// Components
import { MusicIcon, BookIcon, VideoIcon } from '@/components/Icons'
// Store
import { usePlayerStore } from '@/store/usePlayerStore'
import { useUiStore, sectionOfScreen } from '@/store/useUiStore'

export default function SectionSwitcher() {
  const screen = useUiStore((s) => s.screen)
  const switchSection = useUiStore((s) => s.switchSection)
  const selectSection = (section: 'music' | 'audiobooks' | 'video') => {
    usePlayerStore.getState().pause()
    switchSection(section)
    if (section !== 'video') void usePlayerStore.getState().restoreSource(section === 'music' ? 'music' : 'audiobook')
  }
  const section = sectionOfScreen(screen)

  return (
    <nav className="section-switcher" aria-label="App section">
      <button
        type="button"

        aria-pressed={section === 'music'}
        className={`section-tab${section === 'music' ? ' active' : ''}`}
        onClick={() => selectSection('music')}
      >
        <MusicIcon width={16} height={16} />
        Music
      </button>
      <button
        type="button"

        aria-pressed={section === 'audiobooks'}
        className={`section-tab${section === 'audiobooks' ? ' active' : ''}`}
        onClick={() => selectSection('audiobooks')}
      >
        <BookIcon width={16} height={16} />
        Audio Books
      </button>
      <button type="button" className={`section-tab${section === 'video' ? ' active' : ''}`} aria-pressed={section === 'video'} onClick={() => selectSection('video')}>
        <VideoIcon width={16} height={16} />Video
      </button>
    </nav>
  )
}

// Components
import { MusicIcon, BookIcon, VideoIcon } from '@/components/Icons'
// Store
import { useUiStore, sectionOfScreen } from '@/store/useUiStore'

export default function SectionSwitcher() {
  const screen = useUiStore((s) => s.screen)
  const goHome = useUiStore((s) => s.goHome)
  const openAudiobookLibrary = useUiStore((s) => s.openAudiobookLibrary)
  const openVideo = useUiStore((s) => s.openVideo)
  const section = sectionOfScreen(screen)

  return (
    <nav className="section-switcher" aria-label="App section">
      <button
        type="button"

        aria-pressed={section === 'music'}
        className={`section-tab${section === 'music' ? ' active' : ''}`}
        onClick={goHome}
      >
        <MusicIcon width={16} height={16} />
        Music
      </button>
      <button
        type="button"

        aria-pressed={section === 'audiobooks'}
        className={`section-tab${section === 'audiobooks' ? ' active' : ''}`}
        onClick={openAudiobookLibrary}
      >
        <BookIcon width={16} height={16} />
        Audio Books
      </button>
      <button type="button" className={`section-tab${section === 'video' ? ' active' : ''}`} aria-pressed={section === 'video'} onClick={openVideo}>
        <VideoIcon width={16} height={16} />Video
      </button>
    </nav>
  )
}

import StoryRing from './StoryRing.jsx'

export default function StoryTray({
  stories = [],
  onStoryClick,
  onCreateStory,
  className = '',
}) {
  return (
    <section
      aria-label="Stories"
      className={['w-full', className].join(' ')}
    >
      <div
        className={[
          'flex gap-2 overflow-x-auto px-1 pb-1',
          '[scrollbar-width:none]',
          '[&::-webkit-scrollbar]:hidden',
        ].join(' ')}
      >
        <StoryRing
          name="Your Story"
          label="Your Story"
          isOwn
          hasStory={false}
          onClick={onCreateStory}
        />

        {stories.map((story) => (
          <StoryRing
            key={story.id}
            src={story.avatarUrl ?? story.avatar_url}
            name={story.name ?? story.username ?? 'Student'}
            label={story.label ?? story.name ?? story.username ?? 'Student'}
            hasStory={story.hasStory !== false}
            viewed={story.viewed === true}
            onClick={() => onStoryClick?.(story)}
          />
        ))}
      </div>
    </section>
  )
}

import { buttonClass } from '@/components/ui/button'

/** The API is down, or AniList's budget is used up for an anime it never fetched: a retry, never a 404. */
export function Unavailable({ busy, retry }: { busy: boolean; retry: string }) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-[560px] flex-col items-start gap-3 rounded-lg border border-line-2 bg-surface-1 p-6"
    >
      <h1 className="text-2xl font-bold">{busy ? 'Almost there' : 'The anime library is taking a break'}</h1>
      <p className="text-fg-2">
        {busy
          ? 'We’re fetching this anime for the first time and have to wait our turn with AniList. Try again in a minute.'
          : 'We can’t reach it right now. Your account, list and progress are safe. Try again in a minute.'}
      </p>
      {/* a plain reload: works without JavaScript and re-runs the server render */}
      <a href={retry} className={buttonClass('primary')}>
        Try again
      </a>
    </div>
  )
}

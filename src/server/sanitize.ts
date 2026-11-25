import 'server-only'
import sanitizeHtml from 'sanitize-html'

/**
 * AniList descriptions are third-party HTML. Keep only its basic inline tags; links go out with rel=noopener and only
 * over http(s). Everything else (scripts, styles, event handlers, images, iframes) is dropped.
 */
export function sanitizeDescription(html: string | null): string | null {
  if (!html) return null
  const clean = sanitizeHtml(html, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'p', 'a'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['https', 'http'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer nofollow', target: '_blank' }),
    },
  }).trim()
  return clean || null
}

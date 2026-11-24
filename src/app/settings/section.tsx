import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  const id = `s-${title.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <section aria-labelledby={id} className="contents">
        <div className="flex flex-col gap-1">
          <h2 id={id} className="text-xl font-bold">
            {title}
          </h2>
          {description && <p className="text-fg-3">{description}</p>}
        </div>
        {children}
      </section>
    </Card>
  )
}

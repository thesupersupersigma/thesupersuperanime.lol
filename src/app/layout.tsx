import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Inter, Syne } from 'next/font/google'
import { cookies, headers } from 'next/headers'
import type { ReactNode } from 'react'
import { BackToTop } from '@/components/shell/back-to-top'
import { Footer } from '@/components/shell/footer'
import { GuestMerge } from '@/components/shell/guest-merge'
import { Header } from '@/components/shell/header'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { publicConfig } from '@/config'
import { getAuth } from '@/server/auth'

// next/font downloads these at build time and serves them from this site: no runtime calls to Google.
const syne = Syne({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-syne' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export async function generateMetadata(): Promise<Metadata> {
  const site = publicConfig()
  return {
    metadataBase: new URL(site.url),
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description,
    applicationName: site.name,
  }
}

// Everything is configured from env at runtime (one image for every self-hoster), so nothing is prerendered.
export const dynamic = 'force-dynamic'

export const viewport: Viewport = { themeColor: '#0e0e0e', colorScheme: 'dark' }

export default async function RootLayout({ children }: { children: ReactNode }) {
  const site = publicConfig()
  const h = await headers()
  // a database outage shows the site as a guest instead of an error page
  const session = await getAuth()
    .api.getSession({ headers: h })
    .catch(() => null)
  const motion = (await cookies()).get('motion')?.value

  return (
    <html
      lang="en"
      className={`${syne.variable} ${inter.variable}`}
      data-motion={motion === 'reduce' || motion === 'full' ? motion : undefined}
    >
      <body>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-fg px-4 py-3 font-semibold text-bg focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <TooltipProvider delayDuration={300}>
          <Toaster>
            <Header site={site} user={session?.user ?? null} />
            <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pt-6 outline-none sm:px-8">
              {children}
            </main>
            <Footer site={site} />
            <BackToTop />
            {session && <GuestMerge />}
          </Toaster>
        </TooltipProvider>
        {site.analyticsScriptUrl && (
          <script src={site.analyticsScriptUrl} async nonce={h.get('x-nonce') ?? undefined} />
        )}
      </body>
    </html>
  )
}

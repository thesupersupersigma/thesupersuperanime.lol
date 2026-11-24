'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { savePrefs } from '@/app/actions'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { authClient } from '@/lib/auth-client'
import { errorText } from '@/lib/auth-ui'
import { Section } from './section'

type Msg = { busy?: boolean; error?: string | null; ok?: string }

export function AccountForms({ canVerifyEmail, motion }: { canVerifyEmail: boolean; motion: string }) {
  const router = useRouter()
  const toast = useToast()
  const { data, refetch } = authClient.useSession()
  const [profile, setProfile] = useState<Msg>({})
  const [email, setEmail] = useState<Msg>({})
  const [reduce, setReduce] = useState(motion)
  const user = data?.user
  if (!user) return null

  return (
    <>
      <Section title="Profile">
        <div className="flex items-center gap-4">
          <Avatar name={user.name || user.email} src={user.image} className="size-16 text-2xl" />
          {user.image && (
            <Button
              variant="secondary"
              onClick={async () => {
                const old = user.image
                const { error } = await authClient.updateUser({ image: null })
                if (error) return toast({ text: errorText(error) ?? 'Could not remove the photo' })
                await refetch()
                router.refresh()
                toast({
                  text: 'Photo removed',
                  undo: async () => {
                    await authClient.updateUser({ image: old })
                    await refetch()
                    router.refresh()
                  },
                })
              }}
            >
              Remove photo
            </Button>
          )}
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setProfile({ busy: true })
            const { error } = await authClient.updateUser({ name: String(new FormData(e.currentTarget).get('name')) })
            setProfile(error ? { error: errorText(error) } : { ok: 'Saved.' })
            await refetch()
            router.refresh()
          }}
        >
          <Alert>{profile.error}</Alert>
          <Alert tone="success">{profile.ok}</Alert>
          <Input label="Name" name="name" defaultValue={user.name} autoComplete="name" required maxLength={64} />
          <Button type="submit" className="self-start" loading={profile.busy}>
            Save name
          </Button>
        </form>
      </Section>

      <Section
        title="Email"
        description={
          canVerifyEmail
            ? 'We’ll send a confirmation link to the new address; the change happens when you open it.'
            : undefined
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const newEmail = String(new FormData(e.currentTarget).get('email'))
            setEmail({ busy: true })
            const { error } = await authClient.changeEmail({ newEmail, callbackURL: '/settings' })
            if (error) return setEmail({ error: errorText(error) })
            setEmail({ ok: canVerifyEmail ? `Check ${newEmail} for a confirmation link.` : 'Email changed.' })
            await refetch()
            router.refresh()
          }}
        >
          <Alert>{email.error}</Alert>
          <Alert tone="success">{email.ok}</Alert>
          <Input label="Email" name="email" type="email" defaultValue={user.email} autoComplete="email" required />
          <Button type="submit" className="self-start" loading={email.busy}>
            Change email
          </Button>
        </form>
      </Section>

      <Section title="Motion" description="Animations follow your device’s setting unless you pick one here.">
        <Select
          label="Animations"
          value={reduce}
          onValueChange={async (v) => {
            setReduce(v)
            const root = document.documentElement
            if (v === 'system') delete root.dataset.motion
            else root.dataset.motion = v
            await savePrefs({ reducedMotion: v })
          }}
          options={[
            { value: 'system', label: 'Same as my device' },
            { value: 'reduce', label: 'Reduce motion' },
            { value: 'full', label: 'Full motion' },
          ]}
        />
      </Section>
    </>
  )
}

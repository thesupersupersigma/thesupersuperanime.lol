'use client'
import { LogOut, Settings, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu'
import { authClient } from '@/lib/auth-client'

export function AccountMenu({ name, email, image }: { name: string; email: string; image?: string | null }) {
  const router = useRouter()
  return (
    <Menu>
      <MenuTrigger
        aria-label="Your account"
        className="rounded-md transition-transform duration-hover hover:-translate-y-px active:scale-[.97]"
      >
        <Avatar name={name || email} src={image} />
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="block truncate font-semibold text-fg">{name}</span>
          <span className="block truncate">{email}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden /> Settings
          </Link>
        </MenuItem>
        <MenuItem asChild>
          <Link href="/settings/security">
            <ShieldCheck aria-hidden /> Security
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await authClient.signOut()
            router.push('/')
            router.refresh()
          }}
        >
          <LogOut aria-hidden /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

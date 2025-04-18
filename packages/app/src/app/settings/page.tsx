'use client';
import { Button, Listbox, ListboxItem, ListboxSection } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { Suspense, useCallback, useState } from 'react';
import Loading from '@/components/basic/Loading';
import { toast } from 'react-toastify';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import Navbar from '@/components/basic/Navbar';

export default function Setting() {
  const [loading, setLoading] = useState(false);

  const router = useRouter();

  const { theme, setTheme } = useTheme();

  function toggleTheme() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  const IconWrapper = useCallback(
    ({ icon, className }: { icon: string; className?: string }) => (
      <div
        className={`flex items-center rounded-small justify-center w-7 h-7 bg-default/50 text-foreground ${className || ''}`}
      >
        <Icon icon={icon} className="text-lg" />
      </div>
    ),
    [],
  );

  return (
    <Suspense fallback={<Loading />}>
      <div className="s-container">
        <Navbar className="mb-5">
          <div className="text-lg font-bold text-center">Settings</div>
        </Navbar>
        <Loading loading={loading}>
          <Listbox aria-label=" ">
            <ListboxSection title="General">
              <ListboxItem
                onClick={toggleTheme}
                key="theme"
                startContent={<IconWrapper icon="solar:pallete-2-outline" />}
                endContent={
                  <div className="flex items-center gap-2">
                    <Icon
                      icon={theme === 'dark' ? `bi:moon-stars-fill` : `bi:sun-fill`}
                      className="text-sm"
                    />
                    <span className="text-sm">{theme === 'dark' ? 'Dark' : 'Light'}</span>
                    <Icon
                      icon="eva:arrow-ios-forward-outline"
                      className="text-lg text-default-500"
                    />
                  </div>
                }
                classNames={{ base: 'py-3' }}
              >
                Theme
              </ListboxItem>
            </ListboxSection>
            <ListboxSection title="Other">
              <ListboxItem
                key="contact"
                startContent={<IconWrapper icon="mingcute:telegram-fill" />}
                endContent={
                  <Icon icon="eva:chevron-right-fill" className="text-lg text-default-500" />
                }
                classNames={{ base: 'py-3' }}
              >
                Contact Us
              </ListboxItem>
              <ListboxItem
                key="privacy"
                startContent={<IconWrapper icon="fluent:lock-24-filled" />}
                endContent={
                  <Icon icon="eva:chevron-right-fill" className="text-lg text-default-500" />
                }
                classNames={{ base: 'py-3' }}
              >
                Privacy Policy
              </ListboxItem>
            </ListboxSection>
          </Listbox>
        </Loading>
      </div>
    </Suspense>
  );
}

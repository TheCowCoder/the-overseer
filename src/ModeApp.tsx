import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Network, Smartphone } from 'lucide-react';

import OnlineMultiplayerApp from './App';
import { Button } from './components/Button';
import { LocalPassAndPlayApp } from './components/LocalPassAndPlayApp';

type AppMode = 'online' | 'local' | null;

export default function ModeApp() {
  const [mode, setMode] = useState<AppMode>(null);

  if (mode === 'online') {
    return <OnlineMultiplayerApp onBack={() => setMode(null)} />;
  }

  if (mode === 'local') {
    return <LocalPassAndPlayApp onBack={() => setMode(null)} />;
  }

  return (
    <div className="relative mx-auto flex h-screen w-full max-w-md flex-col overflow-x-hidden bg-duo-gray shadow-2xl md:mt-[2.5vh] md:h-[95vh] md:rounded-3xl">
      <main className="relative z-10 flex flex-1 flex-col justify-center overflow-y-auto px-6 py-10">
        <AnimatePresence mode="wait">
          <motion.div key="MODE_HOME" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-full flex-col justify-center gap-6">
            <div className="space-y-3 text-center">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-400">The Overseer</p>
              <h1 className="text-5xl font-black leading-none text-gray-900">Choose Your Arena</h1>
              <p className="mx-auto max-w-sm text-sm font-bold leading-relaxed text-gray-500">
                Play online with live matchmaking, or keep the device on one table and pass it back and forth locally.
              </p>
            </div>

            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => setMode('online')}
                className="rounded-[2rem] border-2 border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-duo-blue text-white shadow-sm">
                    <Network className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Online Multiplayer</p>
                    <h2 className="mt-2 text-2xl font-black text-gray-800">Queue For A Match</h2>
                    <p className="mt-2 text-sm font-bold leading-relaxed text-gray-500">
                      Set your username and color, enter the queue, and let the server sync both players in real time.
                    </p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('local')}
                className="rounded-[2rem] border-2 border-gray-100 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-duo-purple text-white shadow-sm">
                    <Smartphone className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-gray-400">Local Pass &amp; Play</p>
                    <h2 className="mt-2 text-2xl font-black text-gray-800">Share One Device</h2>
                    <p className="mt-2 text-sm font-bold leading-relaxed text-gray-500">
                      Set both players up once, build the board locally, and keep handing the phone over when the Overseer tells you to.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <Button onClick={() => setMode('online')}>Start Online</Button>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
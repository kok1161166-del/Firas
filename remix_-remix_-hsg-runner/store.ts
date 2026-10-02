
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { create } from 'zustand';
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { GameStatus } from './types';
import { supabase } from './supabase';
import { Session } from '@supabase/supabase-js';

export interface OnlinePlayer {
  user_id: string;
  name: string;
  trackOffset: number;
  distance: number;
  score: number;
  lane: number;
  y: number;
  z: number;
  is_dead: boolean;
  is_finished: boolean;
}
export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  points: number;
  current_level: number;
  current_map: number;
}

interface GameState {
  // Supabase Auth & Profile
  session: Session | null;
  userProfile: UserProfile | null;
  setSession: (session: Session | null) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  syncProfileToSupabase: (updates: Partial<UserProfile>) => Promise<void>;
  
  status: GameStatus;
  /** Lifetime total for the endless run — this is the number that gets shared. */
  score: number;
  /** Yield of the current tier only (reset on every milestone). */
  levelScore: number;
  /** Frozen snapshot of the tier that was just cleared (used by the milestone card). */
  tierScore: number;
  tierLetters: number;
  lives: number;
  maxLives: number;
  speed: number;
  collectedLetters: number[]; 
  level: number;
  unlockedLevels: number;
  laneCount: number;
  gemsCollected: number;
  /** Lifetime letters across every tier — this is what the server bounds. */
  totalLetters: number;
  /** Non-blocking celebration shown for a moment after each tier clears. */
  milestoneFlash: { id: number; level: number; score: number; letters: number } | null;
  dismissMilestone: () => void;
  /** Total distance ever covered — never resets, the endless counter. */
  distance: number;
  /** Distance at which the current tier started (for the tier progress ring). */
  tierStart: number;
  /** Absolute distance of the next milestone. */
  targetDistance: number;
  /** Wall-clock seconds the current life lasted — used for score verification. */
  runSeconds: number;
  mapId: number;
  
  // Inventory / Abilities
  hasDoubleJump: boolean;
  hasImmortality: boolean;
  isImmortalityActive: boolean;
  isImmortalityActive_timer?: number;
  hasMagnet: boolean;
  hasShield: boolean;
  hasDash: boolean;
  isDashActive: boolean;
  hasTimeWarp: boolean;
  hasMultiplier: boolean;
  hasLaser: boolean;

  // Characters
  unlockedCharacters: string[];
  selectedCharacter: string;

  // Colors & Accessories
  unlockedColors: string[];
  selectedColor: string;
  unlockedAccessories: string[];
  selectedAccessory: string | null;

  // Heart Power
  heartPowerLevel: number;
  currentLifeHits: number;

  // Verified (server-accepted) best run — the only number allowed to be shared.
  bestScore: number;
  bestDistance: number;
  bestCode: string;
  setBest: (score: number, distance: number, code: string) => void;

  // Actions
  startGame: (level?: number) => void;
  startNextLevel: () => void;
  restartGame: () => void;
  takeDamage: () => void;
  addScore: (amount: number) => void;
  collectGem: (value: number) => void;
  collectLetter: (index: number) => void;
  setStatus: (status: GameStatus) => void;
  setDistance: (dist: number) => void;
  setTargetDistance: (dist: number) => void;
  setMapId: (id: number) => void;
  tickRunTimer: (seconds: number) => void;
  
  selectCharacter: (id: string) => void;
  selectColor: (id: string) => void;
  selectAccessory: (id: string | null) => void;
  completeLevel: (exactDistance?: number) => void;
  activateImmortality: () => void;
  activateDash: () => void;
  effectsEnabled: boolean;
  soundEnabled: boolean;
  toggleEffects: () => void;
  toggleSound: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  
  // Multiplayer State
  localUserId: string | null;
  roomId: string | null;
  roomCode: string | null;
  isHost: boolean;
  players: any[];
  onlinePlayers: OnlinePlayer[];
  multiplayerMode: 'PUBLIC' | 'PRIVATE' | null;
  countdown: number;
  
  setLocalUserId: (id: string) => void;
  setRoomId: (id: string | null) => void;
  setRoomCode: (code: string | null) => void;
  setIsHost: (isHost: boolean) => void;
  setPlayers: (players: any[]) => void;
  setOnlinePlayers: (players: OnlinePlayer[]) => void;
  updateOnlinePlayer: (id: string, data: Partial<OnlinePlayer>) => void;
  setMultiplayerMode: (mode: 'PUBLIC' | 'PRIVATE' | null) => void;
  startOnlineGame: () => void;
  resetOnlineState: () => void;
}

const MAX_LEVEL = 999999; // Practically infinite — the runner has no ceiling

/**
 * Milestone length in light-years. It grows with the tier so an endless run
 * keeps rewarding the player while the difficulty curve keeps biting.
 */
export const milestoneLength = (level: number) => 1100 + Math.min(level - 1, 40) * 220;

/** Run start speed — the endless ramp lives in LevelManager. */
const RUN_SPEED_START = 34;

/**
 * Debounced localStorage adapter.
 *
 * zustand's `persist` serialises and writes on *every* state change. The
 * runner pushes fresh distance numbers several times a second, so the raw
 * adapter produced a steady stream of synchronous writes that showed up as
 * periodic stalls on long runs. Writes are now coalesced and flushed when the
 * tab goes away.
 */
const createDebouncedStorage = (): PersistStorage<unknown> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending) {
      try { localStorage.setItem(pending.key, pending.value); } catch { /* quota / private mode */ }
      pending = null;
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  }

  return {
    getItem: (name: string) => {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<unknown>) : null;
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: StorageValue<unknown>) => {
      pending = { key: name, value: JSON.stringify(value) };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 600);
    },
    removeItem: (name: string) => {
      pending = null;
      try { localStorage.removeItem(name); } catch { /* noop */ }
    },
  };
};

/**
 * Profile writes are coalesced. Collecting a gem used to fire a Supabase
 * update per pickup; now at most one write every few seconds happens.
 */
let profileSyncTimer: ReturnType<typeof setTimeout> | null = null;
const queueProfileSync = (updates: Partial<UserProfile>) => {
  if (profileSyncTimer) return;
  profileSyncTimer = setTimeout(() => {
    profileSyncTimer = null;
    useStore.getState().syncProfileToSupabase(updates).catch(() => {});
  }, 5000);
};

export const useStore = create<GameState>()(
  persist(
    (set, get) => ({
      session: null,
      userProfile: null,
      setSession: (session) => set({ session }),
      setUserProfile: (profile) => {
          if (profile) {
              set({ 
                  userProfile: profile,
                  level: profile.current_level,
                  unlockedLevels: Math.max(get().unlockedLevels, profile.current_level),
                  mapId: profile.current_map
              });
          } else {
              set({ userProfile: null });
          }
      },
      syncProfileToSupabase: async (updates) => {
          const { session, userProfile } = get();
          if (session?.user && userProfile) {
              const newProfile = { ...userProfile, ...updates };
              set({ userProfile: newProfile });
              await supabase.from('profiles').update(updates).eq('id', session.user.id);
          }
      },
      status: GameStatus.LANDING,
  score: 0,
  levelScore: 0,
  tierScore: 0,
  tierLetters: 0,
  lives: 5,
  maxLives: 5,
  speed: 0,
  collectedLetters: [],
  level: 1,
  unlockedLevels: 1,
  laneCount: 3,
  gemsCollected: 0,
  totalLetters: 0,
  milestoneFlash: null,
  dismissMilestone: () => set({ milestoneFlash: null }),
  distance: 0,
  tierStart: 0,
  targetDistance: milestoneLength(1),
  runSeconds: 0,
  mapId: 1,
  setMapId: (id) => set({ mapId: id }),
  tickRunTimer: (seconds) => set({ runSeconds: seconds }),
  
  hasDoubleJump: false,
  hasImmortality: false,
  isImmortalityActive: false,
  hasMagnet: false,
  hasShield: false,
  hasDash: false,
  isDashActive: false,
  hasTimeWarp: false,
  hasMultiplier: false,
  hasLaser: false,
  effectsEnabled: true,
  soundEnabled: true,
  unlockedCharacters: ['default'],
  selectedCharacter: 'default',
  unlockedColors: ['char_default_color'],
  selectedColor: 'char_default_color',
  unlockedAccessories: [],
  selectedAccessory: null,
  heartPowerLevel: 1,
  currentLifeHits: 1,

  bestScore: 0,
  bestDistance: 0,
  bestCode: '',
  setBest: (best, bestDist, code) => set((s) => ({
    bestScore: Math.max(s.bestScore, Math.round(best) || 0),
    bestDistance: Math.max(s.bestDistance, Math.round(bestDist) || 0),
    bestCode: Math.max(s.bestScore, best) > s.bestScore || !s.bestCode ? code : s.bestCode,
  })),

  startGame: (level = 1) => {
    const { maxLives, hasDoubleJump, hasImmortality, selectedCharacter } = get();
    
    // Character Stat Multipliers
    let speedMult = 1.0;
    if (selectedCharacter === 'char_neon') speedMult = 1.05;
    if (selectedCharacter === 'char_gold') speedMult = 0.95;
    if (selectedCharacter === 'char_void') speedMult = 1.0;

    set({ 
      status: GameStatus.PLAYING, 
      // A run's score is per-run. Restarting must not be farmable, so this
      // resets here; milestones (startNextLevel) keep it, because an endless
      // run accumulates across tiers.
      score: 0,
      levelScore: 0,
      tierScore: 0,
      tierLetters: 0,
      lives: maxLives, 
      maxLives: maxLives,
      speed: RUN_SPEED_START * speedMult,
      collectedLetters: [],
      level: level,
      laneCount: 3,
      gemsCollected: 0,
      totalLetters: 0,
      milestoneFlash: null,
      distance: 0,
      tierStart: 0,
      targetDistance: milestoneLength(level),
      runSeconds: 0,
      hasDoubleJump: hasDoubleJump,
      hasImmortality: hasImmortality,
      isImmortalityActive: false,
      hasMagnet: get().hasMagnet,
      hasShield: get().hasShield,
      hasDash: get().hasDash,
      isDashActive: false,
      hasTimeWarp: get().hasTimeWarp,
      hasMultiplier: get().hasMultiplier,
      hasLaser: get().hasLaser,
      // Clear online state if starting single player
      roomId: null,
      roomCode: null,
      onlinePlayers: [],
      currentLifeHits: get().heartPowerLevel
    });
  },

  startNextLevel: () => {
    // Endless: a milestone never ends the run, it hands over a harder tier
    // Endless: a milestone never ends the run, it hands over a harder tier
    // while the run's score and distance keep climbing.
    const nextLevel = Math.min(MAX_LEVEL, get().level + 1);
    const total = get().score;
    const tierStart = Math.floor(get().distance);
    const { maxLives, heartPowerLevel } = get();

    set({
      status: GameStatus.PLAYING,
      level: nextLevel,
      levelScore: 0,
      collectedLetters: [],
      tierStart,
      targetDistance: tierStart + milestoneLength(nextLevel),
      // Lives top back up between tiers, the run only really ends on death.
      lives: maxLives,
      currentLifeHits: heartPowerLevel,
      gemsCollected: 0,
      score: total,
    });
  },

  restartGame: () => {
    get().startGame(1);
  },

  takeDamage: () => {
    const { lives, isImmortalityActive, isDashActive, status, localUserId, hasShield, currentLifeHits, heartPowerLevel } = get();
    if (isImmortalityActive || isDashActive) return;

    if (hasShield) {
        set({ hasShield: false });
        return;
    }

    if (currentLifeHits > 1) {
        set({ currentLifeHits: currentLifeHits - 1 });
        return;
    }

    if (lives > 1) {
      set({ lives: lives - 1, currentLifeHits: heartPowerLevel });
    } else {
      if (status === GameStatus.ONLINE) {
         set({ lives: 0, speed: 0 }); // Stay online, speed 0 stops movement
         if (localUserId) {
            get().updateOnlinePlayer(localUserId, { is_dead: true });
         }
      } else {
         set({ lives: 0, status: GameStatus.GAME_OVER, speed: 0 });
      }
    }
  },

  addScore: (amount) => {
      const newScore = get().score + amount;
      set((state) => ({ score: newScore, levelScore: state.levelScore + amount }));
      queueProfileSync({ points: newScore });
  },
  
  collectGem: (value) => {
      const { hasMultiplier } = get();
      const actualValue = value * (hasMultiplier ? 2 : 1);
      const newScore = get().score + actualValue;
      set((state) => ({ 
        score: newScore, 
        levelScore: state.levelScore + actualValue,
        gemsCollected: state.gemsCollected + 1 
      }));
      queueProfileSync({ points: newScore });
  },

  setDistance: (dist) => set((state) => {
    const newState: Partial<GameState> = { distance: dist };
    if (state.status === GameStatus.ONLINE && state.localUserId) {
      newState.onlinePlayers = state.onlinePlayers.map(p => 
        p.user_id === state.localUserId ? { ...p, distance: dist } : p
      );
    }
    return newState;
  }),
  setTargetDistance: (dist) => set({ targetDistance: dist }),

  collectLetter: (index) => {
    const { collectedLetters, score, levelScore } = get();
    
    if (!collectedLetters.includes(index)) {
      // Each letter is worth 1000 and also nudges the endless speed ramp.
      // The permanent speed boost is intentionally gone: speed is derived
      // from distance in LevelManager so the ramp stays monotonic.
      const newLetters = [...collectedLetters, index];
      const totalLetters = get().totalLetters + 1;

      set({ 
        collectedLetters: newLetters,
        totalLetters,
        score: score + 1000,
        levelScore: levelScore + 1000
      });
      queueProfileSync({ points: score + 1000 });
    }
  },

  /**
   * A tier milestone was reached.
   *
   * The run keeps playing: no pause, no modal, no "you finished" screen — a
   * celebration banner slides over the action and the next tier starts
   * immediately, wider and faster. An endless runner that stops to celebrate
   * reads as a game that kicked you out, which is exactly what we removed.
   */
  completeLevel: (exactDistance?: number) => {
      const { level, unlockedLevels, levelScore, collectedLetters } = get();
      const reached = Math.floor(
        typeof exactDistance === 'number' && Number.isFinite(exactDistance)
          ? exactDistance
          : get().distance,
      );
      const nextLevel = Math.min(MAX_LEVEL, level + 1);

      get().startNextLevel();
      set({
        tierScore: levelScore,
        tierLetters: collectedLetters.length,
        unlockedLevels: Math.max(unlockedLevels, nextLevel),
        tierStart: reached,
        targetDistance: reached + milestoneLength(nextLevel),
        milestoneFlash: {
          id: nextLevel,
          level: nextLevel,
          score: levelScore,
          letters: collectedLetters.length,
        },
      });
  },

  selectCharacter: (id: string) => {
      if (get().unlockedCharacters.includes(id)) {
          set({ selectedCharacter: id });
      }
  },

  selectColor: (id: string) => {
      if (get().unlockedColors.includes(id)) {
          set({ selectedColor: id });
      }
  },

  selectAccessory: (id: string | null) => {
      if (id === null || get().unlockedAccessories.includes(id)) {
          set({ selectedAccessory: id });
      }
  },

  activateImmortality: () => {
      const { hasImmortality, isImmortalityActive } = get();
      if (hasImmortality && !isImmortalityActive) {
          set({ hasImmortality: false, isImmortalityActive: true });
          
          setTimeout(() => {
              set({ isImmortalityActive: false });
          }, 3000); 
      }
  },

  activateDash: () => {
      const { hasDash, isDashActive } = get();
      if (hasDash && !isDashActive) {
          set({ hasDash: false, isDashActive: true, speed: get().speed + 100 });
          
          setTimeout(() => {
              set({ isDashActive: false, speed: Math.max(0, get().speed - 100) });
          }, 1500); 
      }
  },

  toggleEffects: () => set((state) => ({ effectsEnabled: !state.effectsEnabled })),

  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  pauseGame: () => {
    if (get().status === GameStatus.PLAYING) {
      set({ status: GameStatus.PAUSED });
    }
  },

  resumeGame: () => {
    if (get().status === GameStatus.PAUSED) {
      set({ status: GameStatus.PLAYING });
    }
  },

  setStatus: (status) => set({ status }),

  // Multiplayer Implementation
  localUserId: null,
  roomId: null,
  roomCode: null,
  isHost: false,
  players: [],
  onlinePlayers: [],
  multiplayerMode: null,
  countdown: 0,

  setLocalUserId: (id) => set({ localUserId: id }),
  setRoomId: (id) => set({ roomId: id }),
  setRoomCode: (code) => set({ roomCode: code }),
  setIsHost: (isHost) => set({ isHost }),
  setPlayers: (players) => set({ players }),
  setOnlinePlayers: (players) => set({ onlinePlayers: players }),
  updateOnlinePlayer: (id, data) => set((state) => ({
    onlinePlayers: state.onlinePlayers.map(p => p.user_id === id ? { ...p, ...data } : p)
  })),
  setMultiplayerMode: (mode) => set({ multiplayerMode: mode }),
  
  startOnlineGame: () => {
    const { maxLives, selectedCharacter, players } = get();
    
    let speedMult = 1.0;
    if (selectedCharacter === 'char_neon') speedMult = 1.15;
    if (selectedCharacter === 'char_gold') speedMult = 0.9;
    if (selectedCharacter === 'char_void') speedMult = 1.05;

    // Initialize online players
    // Note: We don't need trackOffsets anymore as they don't show side-by-side
    const onlinePlayers: OnlinePlayer[] = players.map((p, i) => ({
      user_id: p.user_id,
      name: p.name,
      trackOffset: 0, // All on same track visually now (not rendered anyway)
      score: 0,
      distance: 0,
      lane: 0,
      y: 0,
      z: 0,
      is_dead: false,
      is_finished: false
    }));

    set({ 
      status: GameStatus.ONLINE, 
      score: 0,
      levelScore: 0,
      lives: maxLives, 
      maxLives: maxLives,
      speed: (RUN_SPEED_START - 4) * speedMult, // Start slightly slower for "easy" beginning
      collectedLetters: [],
      level: 1,
      laneCount: 3, 
      onlinePlayers,
      gemsCollected: 0,
      distance: 0,
      targetDistance: 999999, // Infinite-ish
      hasDoubleJump: get().hasDoubleJump,
      hasImmortality: get().hasImmortality,
      isImmortalityActive: false,
      countdown: 3
    });

    const timer = setInterval(() => {
      const { countdown } = get();
      if (countdown > 0) {
        set({ countdown: countdown - 1 });
      } else {
        clearInterval(timer);
      }
    }, 1000);
  },
  resetOnlineState: () => {
    set({
      roomId: null,
      roomCode: null,
      isHost: false,
      players: [],
      onlinePlayers: [],
      multiplayerMode: null,
      status: [GameStatus.ONLINE, GameStatus.GAME_OVER, GameStatus.VICTORY, GameStatus.LEVEL_COMPLETE].includes(get().status) 
        ? GameStatus.MENU 
        : get().status
    });
  },
    }),
    {
      name: 'hsg-run-storage',
      storage: createDebouncedStorage(),
      version: 2,
      partialize: (state) => ({
        maxLives: state.maxLives,
        unlockedLevels: state.unlockedLevels,
        hasDoubleJump: state.hasDoubleJump,
        hasImmortality: state.hasImmortality,
        hasMagnet: state.hasMagnet,
        hasShield: state.hasShield,
        hasDash: state.hasDash,
        hasTimeWarp: state.hasTimeWarp,
        hasMultiplier: state.hasMultiplier,
        hasLaser: state.hasLaser,
        selectedCharacter: state.selectedCharacter,
        selectedColor: state.selectedColor,
        selectedAccessory: state.selectedAccessory,
        heartPowerLevel: state.heartPowerLevel,
        effectsEnabled: state.effectsEnabled,
        soundEnabled: state.soundEnabled,
        bestScore: state.bestScore,
        bestDistance: state.bestDistance,
        bestCode: state.bestCode,
      }),
      migrate: (persisted: any) => {
        // v1 kept `score` / `gemsCollected` locally. Those are the two fields
        // that made score tampering trivial, so they are intentionally dropped
        // instead of migrated — only server-verified values survive a reset.
        if (!persisted || typeof persisted !== 'object') return persisted;
        const { score, gemsCollected, levelScore, currentLifeHits, ...rest } = persisted;
        void score; void gemsCollected; void levelScore; void currentLifeHits;
        return { ...rest, bestScore: Number(persisted.bestScore) || 0, bestDistance: Number(persisted.bestDistance) || 0, bestCode: '' };
      },
    }
  )
);

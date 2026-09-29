import React, { useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import './RunnerGame.css';
import { Environment } from '../remix_-remix_-hsg-runner/components/World/Environment';
import { Player } from '../remix_-remix_-hsg-runner/components/World/Player';
import { LevelManager } from '../remix_-remix_-hsg-runner/components/World/LevelManager';
import { Effects } from '../remix_-remix_-hsg-runner/components/World/Effects';
import { HUD } from '../remix_-remix_-hsg-runner/components/UI/HUD';
import { useStore } from '../remix_-remix_-hsg-runner/store';
import { GameStatus } from '../remix_-remix_-hsg-runner/types';
import type { Language } from '../types';

interface RunnerGameProps {
    lang: Language;
    onExit: () => void;
}

// The game front page is the original landing screen. Account / info /
// multiplayer screens are stripped in game-only mode — any navigation
// toward them snaps back to the landing. Playable states
// (PLAYING / PAUSED / SHOP / LEVEL_COMPLETE / GAME_OVER / VICTORY) are kept.
const AWAY_STATUSES = new Set<GameStatus>([
    GameStatus.AUTH,
    GameStatus.PROFILE,
    GameStatus.MENU,
    GameStatus.LEVEL_SELECT,
    GameStatus.LOBBY,
    GameStatus.GUIDELINES,
    GameStatus.PRIVACY,
    GameStatus.ABOUT,
    GameStatus.CONTACT,
    GameStatus.TERMS,
]);

// Dynamic Camera Controller (same as the standalone runner)
const CameraController = () => {
    const { camera, size } = useThree();
    const { laneCount } = useStore();

    useFrame((state, delta) => {
        const aspect = size.width / size.height;
        const isMobile = aspect < 1.2;

        const heightFactor = isMobile ? 2.0 : 0.5;
        const distFactor = isMobile ? 4.5 : 1.0;

        const extraLanes = Math.max(0, laneCount - 3);

        const targetX = 0;
        const targetY = 5.5 + extraLanes * heightFactor;
        const targetZ = 8.0 + extraLanes * distFactor;

        const targetPos = new THREE.Vector3(targetX, targetY, targetZ);
        camera.position.lerp(targetPos, delta * 4.0);
        camera.lookAt(targetX, 0, -30);
    });

    return null;
};

function Scene() {
    const { effectsEnabled } = useStore();
    return (
        <>
            <Environment />
            <group>
                {/* Local Player ONLY */}
                <group userData={{ isPlayer: true }} name="PlayerGroup">
                    <Player />
                </group>

                <LevelManager />
            </group>
            {effectsEnabled && <Effects />}
        </>
    );
}

export const RunnerGame: React.FC<RunnerGameProps> = ({ lang, onExit }) => {
    const isAr = lang === 'ar';

    // Open on the game front page (landing) — no auto-start.
    // Any detour to a stripped screen returns to the landing.
    useEffect(() => {
        useStore.getState().setStatus(GameStatus.LANDING);
        const unsub = useStore.subscribe((s) => {
            if (AWAY_STATUSES.has(s.status)) useStore.getState().setStatus(GameStatus.LANDING);
        });
        return () => unsub();
    }, []);

    // Lock background scroll + Esc to go back.
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onExit();
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', onKey);
        };
    }, [onExit]);

    return (
        <div className="runner-scope relative w-full h-[100dvh] bg-black overflow-hidden select-none" dir="ltr">
            <Canvas
                shadows
                dpr={[1, 1.5]}
                gl={{ antialias: false, stencil: false, depth: true, powerPreference: 'high-performance' }}
                camera={{ position: [0, 5.5, 8], fov: 60 }}
            >
                <CameraController />
                <Scene />
            </Canvas>
            <HUD />

            {/* Back to the hub */}
            <button
                type="button"
                onClick={onExit}
                className="btn-arena absolute top-4 left-4 z-[300] inline-flex items-center gap-2.5 rounded-2xl border border-[#C9A24B]/50 bg-black/70 px-5 py-3 text-sm font-black text-[#F0DDAE] backdrop-blur-xl shadow-[0_10px_36px_rgba(0,0,0,0.6)] hover:bg-[#C9A24B]/15 hover:border-[#F0DDAE]/80 active:scale-95"
            >
                <svg className="w-4 h-4 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 12H5M11 18l-6-6 6-6" />
                </svg>
                <span dir={isAr ? 'rtl' : 'ltr'}>{isAr ? 'رجوع' : 'Back'}</span>
            </button>

            {/* Game badge */}
            <div className="absolute top-4 right-4 z-[300] hidden sm:flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2 backdrop-blur-xl" dir="ltr">
                <span className="w-2 h-2 rounded-full bg-[#53FC18] animate-pulse shadow-[0_0_10px_#53FC18]" />
                <span className="text-[10px] font-black tracking-[0.28em] text-white/70">FIRAS RUNNER</span>
            </div>
        </div>
    );
};

export default RunnerGame;

import React from 'react';
import { motion } from 'motion/react';
import { Play, ChevronRight, Zap, Target, Award } from 'lucide-react';
import { useStore } from '../../store';
import { audio } from '../System/Audio';

export const LandingScreen: React.FC = () => {
    const { startGame, unlockedLevels } = useStore();

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[150] bg-[#050011] overflow-y-auto pointer-events-auto"
        >
            <div className="min-h-full flex flex-col items-center justify-start py-20 px-4 md:px-12 relative w-full">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.1)_0%,transparent_100%)] pointer-events-none fixed"></div>
                
                <div className="relative w-full max-w-6xl flex flex-col items-center z-10">
                
                {/* Hero Section */}
                <motion.div 
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 1, type: "spring" }}
                    className="text-center mb-16"
                >
                    <div className="inline-block px-4 py-1 rounded-full border border-[#C9A24B]/50 bg-[#C9A24B]/10 text-[#F0DDAE] text-xs tracking-[0.3em] font-mono mb-6 shadow-[0_0_15px_rgba(201,162,75,0.25)]" dir="ltr">
                        FIRAS ARCADE • NEON GRID
                    </div>
                    <h1 className="text-6xl md:text-9xl font-black italic uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white via-[#F0DDAE] to-[#C9A24B] drop-shadow-[0_0_40px_rgba(201,162,75,0.45)] leading-none mb-6" dir="ltr">
                        FIRAS<br/>RUNNER
                    </h1>
                    <p className="text-gray-400 text-lg md:text-2xl max-w-2xl mx-auto font-cyber tracking-wide leading-relaxed">
                        Survive the cyber void. Collect data fragments. Master the ultimate synthwave endless runner.
                    </p>
                </motion.div>

                {/* Call to Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-6 w-full max-w-2xl mb-24">
                    <motion.button
                        whileHover={{ scale: 1.05, boxShadow: "0 0 44px rgba(201, 162, 75, 0.55)" }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => { audio.init(); startGame(unlockedLevels); }}
                        className="flex-1 py-5 bg-gradient-to-b from-[#F0DDAE] via-[#C9A24B] to-[#8A6A3A] text-black font-black text-xl md:text-2xl rounded-2xl flex items-center justify-center italic tracking-widest uppercase relative overflow-hidden group shadow-[0_0_36px_rgba(201,162,75,0.4)]"
                    >
                        <span className="relative z-10 flex items-center" dir="ltr">
                            Play Now • العب الآن <Play className="ml-3 w-6 h-6 fill-black" />
                        </span>
                        <div className="absolute inset-0 bg-white/30 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                    </motion.button>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
                    <motion.div 
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md"
                    >
                        <Zap className="w-12 h-12 text-yellow-400 mb-6 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                        <h3 className="text-2xl font-black italic text-white uppercase mb-4">High-Speed Action</h3>
                        <p className="text-gray-400 leading-relaxed font-cyber text-sm">
                            Experience adrenaline-pumping speeds as you navigate through procedurally generated neon landscapes and cybernetic obstacles.
                        </p>
                    </motion.div>

                    <motion.div 
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md"
                    >
                        <Target className="w-12 h-12 text-pink-500 mb-6 drop-shadow-[0_0_15px_rgba(236,72,153,0.5)]" />
                        <h3 className="text-2xl font-black italic text-white uppercase mb-4">Epic Upgrades</h3>
                        <p className="text-gray-400 leading-relaxed font-cyber text-sm">
                            Access the Neon Market to upgrade your runner with energy shields, plasma cannons, and custom avatars to dominate the grid.
                        </p>
                    </motion.div>

                    <motion.div 
                        initial={{ y: 50, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="bg-black/40 border border-white/10 rounded-3xl p-8 backdrop-blur-md"
                    >
                        <Award className="w-12 h-12 text-[#D9C08A] mb-6 drop-shadow-[0_0_15px_rgba(217,192,138,0.5)]" />
                        <h3 className="text-2xl font-black italic text-white uppercase mb-4">Arcade Records</h3>
                        <p className="text-gray-400 leading-relaxed font-cyber text-sm">
                            No sign-up, no waiting — every run saves your best right in your browser. Beat your own legend, run after run.
                        </p>
                    </motion.div>
                </div>
                
                {/* Gameplay Showcase Section */}
                <div className="mt-32 w-full flex flex-col lg:flex-row items-center gap-12 lg:gap-24 mb-24">
                    <motion.div 
                        initial={{ x: -50, opacity: 0 }}
                        whileInView={{ x: 0, opacity: 1 }}
                        viewport={{ once: true, margin: "-100px" }}
                        className="flex-1 space-y-6"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs tracking-[0.2em] font-mono shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                            NEURAL ENGINE
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                            Immersive <span className="text-purple-400">Cyber</span> Experience
                        </h2>
                        <p className="text-gray-400 leading-relaxed font-cyber text-sm md:text-base">
                            Dive deep into a procedurally generated neon void. Our custom 3D engine ensures buttery smooth 60FPS performance directly in your browser. Evade red-glowing sentinels, collect data crystals to upgrade your runner, and conquer the global leaderboards.
                        </p>
                        
                        <div className="grid grid-cols-2 gap-4 pt-4">
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                <h4 className="text-cyan-400 font-black italic uppercase text-lg mb-1">Infinite</h4>
                                <p className="text-xs text-gray-500 font-mono">Procedural Generation</p>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                                <h4 className="text-[#D9C08A] font-black italic uppercase text-lg mb-1">Instant</h4>
                                <p className="text-xs text-gray-500 font-mono">No Sign-Up Needed</p>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div 
                        initial={{ x: 50, opacity: 0, scale: 0.9 }}
                        whileInView={{ x: 0, opacity: 1, scale: 1 }}
                        viewport={{ once: true, margin: "-100px" }}
                        className="flex-1 relative w-full"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 blur-3xl -z-10 rounded-full animate-pulse"></div>
                        <div className="relative rounded-3xl overflow-hidden border-2 border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.15)] group">
                            {/* Window UI Bar */}
                            <div className="h-8 bg-black/80 border-b border-white/10 flex items-center px-4 gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
                                <div className="ml-2 text-[10px] font-mono text-white/30 tracking-widest uppercase">Simulation_Active</div>
                            </div>
                            <img 
                                src="/gameplay_demo.png" 
                                alt="Gameplay Demo" 
                                className="w-full h-auto object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#050011] via-transparent to-transparent opacity-60"></div>
                        </div>
                    </motion.div>
                </div>

                {/* Footer Links */}
                <div className="mt-12 w-full flex flex-col md:flex-row justify-between items-center text-[10px] text-gray-500 uppercase tracking-widest font-mono border-t border-white/10 pt-8 pb-12">
                    <div dir="ltr">© 2026 FIRAS • RISE WITH FIRE</div>
                    <div className="flex gap-4 mt-4 md:mt-0" dir="ltr">
                        <span className="text-[#C9A24B]/70">FIRAS ARCADE</span>
                    </div>
                </div>
            </div>
            </div>
        </motion.div>
    );
};

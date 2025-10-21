import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Icon } from './components/Icon';
import { Visualizer, VisualizerMode } from './components/Visualizer';
import { Equalizer } from './components/Equalizer';
import { Track, RepeatMode } from './types';

const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) {
    return '0:00';
  }
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
};

const eqFrequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000];
const visualizerModes: VisualizerMode[] = ['line', 'bars', 'wave', 'circle', 'dots'];


export default function App() {
    const [playlist, setPlaylist] = useState<Track[]>([]);
    const [currentTrackIndex, setCurrentTrackIndex] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.5);
    const [repeatMode, setRepeatMode] = useState<RepeatMode>(RepeatMode.NONE);
    const [isShuffled, setIsShuffled] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);
    const [showVisualizer, setShowVisualizer] = useState(true);
    const [visualizerModeIndex, setVisualizerModeIndex] = useState(0);
    const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

    const [isEqVisible, setIsEqVisible] = useState(false);
    const [eqGains, setEqGains] = useState<number[]>(() => Array(eqFrequencies.length).fill(0));
    
    const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'artist', direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });

    const audioRef = useRef<HTMLAudioElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
    const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
    
    const setupAudioContext = useCallback(() => {
      if (!audioRef.current) return;
      if (audioContext && audioContext.state !== 'closed') return;
  
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = context.createMediaElementSource(audioRef.current);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
  
      const filters = eqFrequencies.map((freq) => {
          const filter = context.createBiquadFilter();
          filter.type = 'peaking';
          filter.frequency.value = freq;
          filter.gain.value = 0;
          filter.Q.value = 1.4;
          return filter;
      });
      
      eqFiltersRef.current = filters;
  
      const connectedFilters = filters.reduce((prev, curr) => {
          prev.connect(curr);
          return curr;
      }, source as AudioNode);
      
      connectedFilters.connect(analyser);
      analyser.connect(context.destination);
  
      setAudioContext(context);
      setAnalyserNode(analyser);
    }, [audioContext]);

    useEffect(() => {
        eqFiltersRef.current.forEach((filter, i) => {
            if(filter) filter.gain.value = eqGains[i];
        });
    }, [eqGains]);
    
    const handleNext = useCallback(() => {
        if (playlist.length === 0) return;
        let nextIndex;
        if (isShuffled) {
            nextIndex = Math.floor(Math.random() * playlist.length);
        } else {
            nextIndex = (currentTrackIndex ?? -1) + 1;
            if (nextIndex >= playlist.length) {
                if (repeatMode === RepeatMode.ALL) {
                    nextIndex = 0;
                } else {
                    setIsPlaying(false);
                    return;
                }
            }
        }
        setCurrentTrackIndex(nextIndex);
        setIsPlaying(true);
    }, [playlist.length, isShuffled, currentTrackIndex, repeatMode]);
    
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const currentTrack = currentTrackIndex !== null ? playlist[currentTrackIndex] : null;

        if (isPlaying && currentTrack) {
            if (audio.src !== currentTrack.url) {
                audio.src = currentTrack.url;
            }
            if(!audioContext || audioContext.state === 'closed') {
              setupAudioContext();
            }
            audio.play().catch(e => console.error("Error playing audio:", e));
        } else {
            audio.pause();
        }
    }, [currentTrackIndex, playlist, isPlaying, setupAudioContext, audioContext]);

    useEffect(() => {
      if (playlist.length === 0 && audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(e => console.error("Error closing AudioContext:", e));
        setAudioContext(null);
        setAnalyserNode(null);
        eqFiltersRef.current = [];
      }
    }, [playlist, audioContext]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
    
        const updateCurrentTime = () => setCurrentTime(audio.currentTime);
        const updateDuration = () => setDuration(audio.duration);
        const handleTrackEnd = () => {
            if (repeatMode === RepeatMode.ONE) {
                audio.currentTime = 0;
                audio.play();
            } else {
                handleNext();
            }
        };

        audio.addEventListener('timeupdate', updateCurrentTime);
        audio.addEventListener('loadedmetadata', updateDuration);
        audio.addEventListener('ended', handleTrackEnd);

        return () => {
            audio.removeEventListener('timeupdate', updateCurrentTime);
            audio.removeEventListener('loadedmetadata', updateDuration);
            audio.removeEventListener('ended', handleTrackEnd);
        };
    }, [repeatMode, handleNext]);
    
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    const handlePlayPause = () => {
        if (playlist.length === 0) return;
        if (currentTrackIndex === null && playlist.length > 0) {
            setCurrentTrackIndex(0);
        }
        setIsPlaying(!isPlaying);
    };

    const handleSelectTrack = (trackId: string) => {
        const index = playlist.findIndex(t => t.id === trackId);
        if (index !== -1) {
            setCurrentTrackIndex(index);
            setIsPlaying(true);
        }
    };

    const handlePrev = () => {
        if (playlist.length === 0) return;
        let prevIndex = (currentTrackIndex ?? 0) - 1;
        if (prevIndex < 0) prevIndex = playlist.length - 1;
        setCurrentTrackIndex(prevIndex);
        setIsPlaying(true);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (audioRef.current) {
            const newTime = parseFloat(e.target.value);
            audioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
        }
    };
    
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVolume = parseFloat(e.target.value);
        setVolume(newVolume);
    };

    const toggleRepeatMode = () => setRepeatMode(prev => (prev + 1) % 3);
    const toggleShuffle = () => setIsShuffled(!isShuffled);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const trackPromises = Array.from(files).map((file: File, index) => {
            return new Promise<Track>((resolve) => {
                const url = URL.createObjectURL(file);
                const audio = document.createElement('audio');
                audio.preload = 'metadata';
                audio.src = url;

                const fileName = file.name.replace(/\.[^/.]+$/, "");
                let artist = 'Unknown Artist';
                let name = fileName;
                
                const parts = fileName.split(' - ');
                if (parts.length > 1) {
                    artist = parts[0].trim();
                    name = parts.slice(1).join(' - ').trim();
                }

                audio.onloadedmetadata = () => {
                    resolve({ id: `${Date.now()}-${index}`, file, name, artist, duration: audio.duration, url });
                };
                audio.onerror = () => {
                     resolve({ id: `${Date.now()}-${index}`, file, name, artist, duration: 0, url });
                };
            });
        });

        const newTracks = await Promise.all(trackPromises);
        const wasEmpty = playlist.length === 0;
        setPlaylist(prev => [...prev, ...newTracks]);
        if (wasEmpty && newTracks.length > 0) {
            setCurrentTrackIndex(0);
            setIsPlaying(true);
        }
        if (event.target) event.target.value = '';
    };

    const handleSort = () => {
        setSortConfig(current => {
            if (current.key === 'name' && current.direction === 'asc') return { key: 'name', direction: 'desc' };
            if (current.key === 'name' && current.direction === 'desc') return { key: 'artist', direction: 'asc' };
            if (current.key === 'artist' && current.direction === 'asc') return { key: 'artist', direction: 'desc' };
            return { key: 'name', direction: 'asc' };
        });
    };
    
    const displayedPlaylist = useMemo(() => {
        return [...playlist]
            .filter(track => 
                track.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                track.artist.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                const key = sortConfig.key;
                const direction = sortConfig.direction === 'asc' ? 1 : -1;
                const valA = a[key]?.toLowerCase() || '';
                const valB = b[key]?.toLowerCase() || '';
                if (valA < valB) return -1 * direction;
                if (valA > valB) return 1 * direction;
                return 0;
            });
    }, [playlist, searchTerm, sortConfig]);

    const handleToggleSelection = (trackId: string) => {
        setSelectedTrackIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(trackId)) {
                newSet.delete(trackId);
            } else {
                newSet.add(trackId);
            }
            return newSet;
        });
    };

    const allDisplayedSelected = useMemo(() => 
        displayedPlaylist.length > 0 && displayedPlaylist.every(t => selectedTrackIds.has(t.id)),
        [displayedPlaylist, selectedTrackIds]
    );

    const handleToggleSelectAll = () => {
      setSelectedTrackIds(prevSelected => {
          const newSelectedIds = new Set(prevSelected);
          const displayedIds = displayedPlaylist.map(t => t.id);
          
          if (allDisplayedSelected) {
              displayedIds.forEach(id => newSelectedIds.delete(id));
          } else {
              displayedIds.forEach(id => newSelectedIds.add(id));
          }
          return newSelectedIds;
      });
    };
    
    const handleDeleteSelected = () => {
        if (selectedTrackIds.size === 0) return;
        if (!window.confirm(`${selectedTrackIds.size}개의 트랙을 삭제하시겠습니까?`)) return;

        const audio = audioRef.current;
        const currentPlayingTrack = currentTrackIndex !== null ? playlist[currentTrackIndex] : null;

        // 1. 선제압: 삭제될 목록에 현재 재생중인 곡이 있다면, 플레이어를 즉시 멈춘다.
        if (currentPlayingTrack && selectedTrackIds.has(currentPlayingTrack.id) && audio) {
            audio.pause();
            audio.src = '';
        }

        // 2. 후처리 준비: 삭제될 트랙과 유지될 트랙을 계산한다.
        const tracksToDelete = playlist.filter(track => selectedTrackIds.has(track.id));
        const newPlaylist = playlist.filter(track => !selectedTrackIds.has(track.id));
        
        // 3. 다음 상태 계산
        let newTrackIndex: number | null = null;
        if (currentPlayingTrack && !selectedTrackIds.has(currentPlayingTrack.id)) {
            newTrackIndex = newPlaylist.findIndex(t => t.id === currentPlayingTrack.id);
        }

        // 4. 상태 업데이트 (React에게 보고)
        setPlaylist(newPlaylist);
        setCurrentTrackIndex(newTrackIndex);
        setSelectedTrackIds(new Set());

        if (newPlaylist.length === 0 || (currentPlayingTrack && selectedTrackIds.has(currentPlayingTrack.id))) {
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
        }
        
        // 5. 가장 마지막에 URL 폐기
        setTimeout(() => {
            tracksToDelete.forEach(track => URL.revokeObjectURL(track.url));
        }, 0);
    };

    const toggleVisualizer = () => setShowVisualizer(prev => !prev);
    const toggleVisualizerMode = () => setVisualizerModeIndex(prev => (prev + 1) % visualizerModes.length);
    const toggleSidebar = () => setIsSidebarVisible(prev => !prev);
    const toggleEq = () => setIsEqVisible(prev => !prev);

    const getRepeatModeTooltip = () => {
        switch (repeatMode) {
            case RepeatMode.ONE: return "한 곡 반복";
            case RepeatMode.ALL: return "전체 반복";
            default: return "반복 안함";
        }
    };
    
    const getSortTooltip = () => {
        const keyMap = { name: '이름', artist: '아티스트' };
        const dirMap = { asc: '오름차순', desc: '내림차순' };
        return `정렬: ${keyMap[sortConfig.key]} (${dirMap[sortConfig.direction]})`;
    };

    const currentTrack = currentTrackIndex !== null ? playlist[currentTrackIndex] : null;

    return (
        <div className="flex items-center justify-center min-h-screen font-sans">
            <div className="w-[950px] h-[720px] bg-gray-800/70 backdrop-blur-sm rounded-lg shadow-2xl border border-gray-700 text-white flex flex-col">
                <header className="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <span className="text-3xl">🎵</span>
                        <h1 className="text-lg font-semibold tracking-wider">GPT PARK PLAYER</h1>
                    </div>
                </header>

                <main className={`flex flex-grow p-4 ${isSidebarVisible ? 'space-x-4' : ''} overflow-hidden`}>
                    {isSidebarVisible && (
                        <aside className="w-1/3 flex flex-col bg-black/20 rounded-md transition-all duration-300">
                            <div className="flex items-center justify-between p-3 border-b border-gray-700/50 flex-shrink-0">
                                <div className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        className="bg-gray-700 border-gray-600 text-cyan-500 rounded focus:ring-cyan-600 focus:ring-offset-gray-800"
                                        checked={allDisplayedSelected}
                                        ref={el => { if (el) el.indeterminate = selectedTrackIds.size > 0 && !allDisplayedSelected; }}
                                        onChange={handleToggleSelectAll}
                                        title="전체 선택/해제"
                                    />
                                    <h2 className="font-bold">파일 목록</h2>
                                </div>
                                <div className="flex items-center space-x-1">
                                    {selectedTrackIds.size > 0 && (
                                        <button onClick={handleDeleteSelected} title="선택한 항목 삭제" className="p-1 rounded-md text-red-400 hover:bg-red-500/20">
                                            <Icon name="trash" className="w-5 h-5" />
                                        </button>
                                     )}
                                    <button onClick={handleSort} title={getSortTooltip()} className="p-1 rounded-md hover:bg-white/10">
                                        <Icon name="sort" className="w-5 h-5 text-gray-400" />
                                    </button>
                                </div>
                            </div>
                            <div className="overflow-y-auto p-2 space-y-1">
                                {displayedPlaylist.length === 0 && (
                                    <div className="text-center text-gray-500 mt-10">
                                        <p>재생목록이 비었습니다.</p>
                                        <p className="text-sm">아래 폴더 아이콘을 클릭하여</p>
                                        <p className="text-sm">음악 파일을 추가하세요.</p>
                                    </div>
                                )}
                                {displayedPlaylist.map((track) => (
                                    <div key={track.id}
                                        className={`flex items-center p-2 rounded-md transition-colors ${currentTrack?.id === track.id ? 'bg-cyan-500/30' : selectedTrackIds.has(track.id) ? 'bg-blue-600/30' : 'hover:bg-white/10'}`}>
                                        <input
                                            type="checkbox"
                                            className="bg-gray-700 border-gray-600 text-cyan-500 rounded focus:ring-cyan-600 focus:ring-offset-gray-800 mr-3 flex-shrink-0"
                                            checked={selectedTrackIds.has(track.id)}
                                            onChange={() => handleToggleSelection(track.id)}
                                        />
                                        <div onClick={() => handleSelectTrack(track.id)} className="flex-grow flex items-center cursor-pointer overflow-hidden">
                                            <img src={`https://picsum.photos/seed/${track.id}/40`} alt="album art" className="w-10 h-10 rounded-md mr-3 flex-shrink-0" />
                                            <div className="flex-grow overflow-hidden">
                                                <p className="text-sm font-semibold truncate">{track.name}</p>
                                                <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                                            </div>
                                            <span className="text-xs text-gray-400 ml-3">{formatTime(track.duration)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </aside>
                    )}
                    <section className={`${isSidebarVisible ? 'w-2/3' : 'w-full'} flex flex-col space-y-4 transition-all duration-300`}>
                        <div className="flex-grow bg-black/30 rounded-md relative overflow-hidden flex items-center justify-center text-gray-500">
                           {showVisualizer ? (
                                <Visualizer analyserNode={analyserNode} mode={visualizerModes[visualizerModeIndex]} />
                            ) : (
                                currentTrack ? (
                                    <img src={`https://picsum.photos/seed/${currentTrack.id}/600`} alt="album art" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="text-center">
                                        <Icon name="music-note" className="w-24 h-24 text-gray-600 mx-auto" />
                                        <p>재생할 트랙을 선택하세요.</p>
                                    </div>
                                )
                            )}
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className="text-xs w-12 text-center">{formatTime(currentTime)}</span>
                            <input type="range" min="0" max={duration || 0} value={currentTime} onChange={handleSeek} className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-400" disabled={playlist.length === 0}/>
                            <span className="text-xs w-12 text-center">{formatTime(duration)}</span>
                        </div>
                        <div className="flex items-center justify-between bg-black/20 p-3 rounded-md">
                             <div className="flex items-center space-x-4">
                                <button onClick={toggleShuffle} title={isShuffled ? "셔플 끄기" : "셔플 켜기"} className={`p-2 rounded-full text-xl transition-opacity ${isShuffled ? 'opacity-100' : 'opacity-50'} hover:opacity-100`}> <span>🔀</span> </button>
                                <button onClick={toggleRepeatMode} title={getRepeatModeTooltip()} className={`p-2 rounded-full relative text-xl transition-opacity ${repeatMode !== RepeatMode.NONE ? 'opacity-100' : 'opacity-50'} hover:opacity-100`}>
                                    {repeatMode === RepeatMode.ONE && <span className="absolute top-0 right-0 text-xs font-bold bg-cyan-500 text-black rounded-full w-4 h-4 flex items-center justify-center">1</span>}
                                    <span>🔁</span>
                                </button>
                             </div>
                             <div className="flex items-center space-x-4">
                                <button onClick={handlePrev} title="이전 곡" className="p-2 rounded-full text-gray-300 hover:bg-white/10 disabled:text-gray-600" disabled={playlist.length === 0}> <Icon name="prev" className="w-7 h-7" /> </button>
                                <button onClick={handlePlayPause} title={isPlaying ? "일시정지" : "재생"} className="w-14 h-14 flex items-center justify-center bg-cyan-400 text-black rounded-full hover:bg-cyan-300 transition-transform transform hover:scale-105 disabled:bg-gray-600" disabled={playlist.length === 0}>
                                    <Icon name={isPlaying ? 'pause' : 'play'} className="w-8 h-8" />
                                </button>
                                <button onClick={handleNext} title="다음 곡" className="p-2 rounded-full text-gray-300 hover:bg-white/10 disabled:text-gray-600" disabled={playlist.length === 0}> <Icon name="next" className="w-7 h-7" /> </button>
                             </div>
                             <div className="flex items-center space-x-3 w-1/4">
                                <Icon name="volume" className="w-5 h-5 text-gray-400" />
                                <input type="range" min="0" max="1" step="0.01" value={volume} onChange={handleVolumeChange} className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer range-sm accent-cyan-400"/>
                             </div>
                        </div>
                        <div className="flex items-center justify-between bg-black/20 p-2 rounded-md">
                            <div className="flex items-center space-x-2">
                                <input type="file" ref={fileInputRef} onChange={handleFileChange} multiple accept="audio/*" className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} title="오디오 파일 추가" className="p-2 rounded-md hover:bg-white/10 text-gray-400"><Icon name="folder" className="w-5 h-5"/></button>
                                <button onClick={toggleVisualizer} title={showVisualizer ? "앨범 아트 보기" : "시각화 보기"} className={`p-2 rounded-md hover:bg-white/10 ${!showVisualizer ? 'text-cyan-400' : 'text-gray-400'}`}><Icon name="gallery" className="w-5 h-5"/></button>
                                <button onClick={toggleVisualizerMode} title={`시각화 모드 변경: ${visualizerModes[(visualizerModeIndex + 1) % visualizerModes.length]}`} className={`p-2 rounded-md hover:bg-white/10 text-gray-400`}><Icon name="chart-bar" className="w-5 h-5"/></button>
                                <button onClick={toggleEq} title={"이퀄라이저"} className={`p-2 rounded-md hover:bg-white/10 ${isEqVisible ? 'text-cyan-400' : 'text-gray-400'}`}><Icon name="equalizer" className="w-5 h-5"/></button>
                                <button onClick={toggleSidebar} title={isSidebarVisible ? "사이드바 숨기기" : "사이드바 보이기"} className={`p-2 rounded-md hover:bg-white/10 ${isSidebarVisible ? 'text-cyan-400' : 'text-gray-400'}`}><Icon name="list" className="w-5 h-5"/></button>
                            </div>
                            <div className="flex items-center space-x-2">
                                <div className="relative">
                                    <Icon name="search" className="w-4 h-4 absolute top-1/2 left-3 -translate-y-1/2 text-gray-500" />
                                    <input type="text" placeholder="검색" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-gray-900/50 border border-gray-700 rounded-md py-1.5 pl-9 pr-3 text-sm w-40 focus:ring-cyan-500 focus:border-cyan-500 outline-none" />
                                </div>
                                <button onClick={() => window.location.reload()} title="새로고침" className="p-2 rounded-md hover:bg-white/10 text-gray-400"><Icon name="refresh" className="w-5 h-5"/></button>
                            </div>
                        </div>
                    </section>
                </main>
                <audio ref={audioRef} crossOrigin="anonymous" />
                {isEqVisible && <Equalizer onClose={toggleEq} gains={eqGains} setGains={setEqGains} frequencies={eqFrequencies} />}
            </div>
        </div>
    );
}
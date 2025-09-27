// src/Player.js
import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate, useParams } from 'react-router-dom';

const LoadingSpinner = () => (
    <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-red-600"></div>
    </div>
);

const ErrorMessage = ({ message, onRetry }) => (
    <div className="bg-red-900 text-red-200 p-4 rounded-lg text-center">
        <p><strong>Oops! Terjadi Kesalahan</strong></p>
        <p>{message}</p>
        {onRetry && (
            <button 
                onClick={onRetry}
                className="mt-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition-colors"
            >
                Coba Lagi
            </button>
        )}
    </div>
);

export default function Player() {
    const location = useLocation();
    const navigate = useNavigate();
    const { bookId } = useParams();
    
    const [currentEpisode, setCurrentEpisode] = useState(null);
    const [dramaData, setDramaData] = useState({
        info: null,
        episodes: [],
    });
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Fungsi untuk fetch data drama dan episode
    const fetchDramaData = async (targetBookId) => {
        setIsLoading(true);
        setError(null);
        
        try {
            console.log(`[LOG] Mengambil data untuk bookId: ${targetBookId}`);
            
            const response = await fetch('http://localhost:3001/api/stream-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookId: String(targetBookId) })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Gagal memuat data drama`);
            }
            
            const result = await response.json();
            
            if (result.success === false) {
                throw new Error(result.message || "API mengembalikan error");
            }
            
            if (!result.episodes || result.episodes.length === 0) {
                throw new Error("Tidak ada episode yang tersedia untuk drama ini");
            }
            
            return result.episodes;
            
        } catch (err) {
            console.error(`[ERROR] Fetch drama data:`, err);
            throw err;
        }
    };
    
    // Effect utama untuk handle data loading
    useEffect(() => {
        const initializePlayer = async () => {
            if (!bookId) {
                setError("ID drama tidak valid");
                return;
            }
            
            // Reset state
            setCurrentEpisode(null);
            setDramaData({ info: null, episodes: [] });
            
            try {
                // Cek apakah ada data dari location.state
                if (location.state && 
                    location.state.dramaInfo && 
                    String(location.state.dramaInfo.id) === bookId) {
                    
                    console.log("[LOG] Menggunakan data dari location.state");
                    
                    const { dramaInfo, episodes, selectedEpisode } = location.state;
                    
                    // Verifikasi episodes
                    if (!episodes || episodes.length === 0) {
                        console.log("[LOG] Episodes kosong, fetch ulang...");
                        const fetchedEpisodes = await fetchDramaData(bookId);
                        
                        setDramaData({
                            info: dramaInfo,
                            episodes: fetchedEpisodes,
                        });
                        setCurrentEpisode(fetchedEpisodes[0]);
                    } else {
                        setDramaData({
                            info: dramaInfo,
                            episodes: episodes,
                        });
                        setCurrentEpisode(selectedEpisode || episodes[0]);
                    }
                } else {
                    console.log("[LOG] Tidak ada location.state, fetch data...");
                    
                    // Jika tidak ada data dari state (misal refresh page), fetch data
                    const fetchedEpisodes = await fetchDramaData(bookId);
                    
                    // Buat dummy drama info jika tidak ada
                    const dummyInfo = {
                        id: bookId,
                        title: "Loading...",
                        description: "Sedang memuat informasi drama...",
                        category: "Drama"
                    };
                    
                    setDramaData({
                        info: dummyInfo,
                        episodes: fetchedEpisodes,
                    });
                    setCurrentEpisode(fetchedEpisodes[0]);
                }
                
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        
        initializePlayer();
    }, [bookId, location.state]);
    
    // Fungsi untuk retry
    const handleRetry = () => {
        // Force reload dengan clear state
        setError(null);
        setIsLoading(true);
        
        // Clear location.state dan reload
        window.location.reload();
    };
    
    // Fungsi untuk mengganti episode
    const handleEpisodeChange = (episode) => {
        if (episode.url) {
            setCurrentEpisode(episode);
        } else {
            setError("Episode ini tidak memiliki URL yang valid");
        }
    };

    const handleVideoEnded = React.useCallback(() => {
        const episodes = dramaData.episodes;
        if (!currentEpisode || !episodes || episodes.length === 0) {
            return; // Keluar jika data tidak valid
        }

        // Cari index dari episode yang sedang diputar
        const currentIndex = episodes.findIndex(
            ep => ep.episodeNumber === currentEpisode.episodeNumber
        );

        // Cek apakah ada episode selanjutnya
        if (currentIndex > -1 && currentIndex < episodes.length - 1) {
            const nextEpisode = episodes[currentIndex + 1];
            console.log(`[LOG] Video Selesai. Memutar episode selanjutnya: ${nextEpisode.title}`);
            setCurrentEpisode(nextEpisode); // Set episode selanjutnya
        } else {
            console.log("[LOG] Episode terakhir telah selesai.");
            // Tidak melakukan apa-apa jika ini adalah episode terakhir
        }
    }, [currentEpisode, dramaData.episodes]);
    
    // Loading state
    if (isLoading) {
        return (
            <div className="bg-gray-900 min-h-screen text-white">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-xl font-bold">Loading...</h1>
                        <Link 
                            to="/" 
                            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                        >
                            ← Kembali ke Daftar
                        </Link>
                    </div>
                    <LoadingSpinner />
                </div>
            </div>
        );
    }
    
    // Error state
    if (error) {
        return (
            <div className="bg-gray-900 min-h-screen text-white">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-xl font-bold text-red-400">Error</h1>
                        <Link 
                            to="/" 
                            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                        >
                            ← Kembali ke Daftar
                        </Link>
                    </div>
                    <ErrorMessage message={error} onRetry={handleRetry} />
                </div>
            </div>
        );
    }
    
    // Validasi final sebelum render
    if (!dramaData.info || !currentEpisode || !dramaData.episodes.length) {
        return (
            <div className="bg-gray-900 min-h-screen text-white">
                <div className="container mx-auto px-4 py-8">
                    <ErrorMessage 
                        message="Data drama tidak lengkap" 
                        onRetry={() => navigate('/')} 
                    />
                </div>
            </div>
        );
    }
    
    return (
        <div className="bg-gray-900 min-h-screen text-white p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-xl md:text-2xl font-bold truncate">
                        {dramaData.info.title} - {currentEpisode.title}
                    </h1>
                    <Link 
                        to="/" 
                        className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 text-sm"
                    >
                        ← Kembali ke Daftar
                    </Link>
                </div>

                {/* Video Player */}
                <div className="bg-black mb-4 rounded-lg overflow-hidden flex justify-center">
                    {currentEpisode.url ? (
                        <video 
                            key={`${currentEpisode.episodeNumber}-${currentEpisode.url}`}
                            className="max-h-[75vh] w-full"
                            controls 
                            autoPlay
                            onEnded={handleVideoEnded}
                            onError={(e) => {
                                console.error("Video error:", e);
                                setError("Gagal memuat video. Silakan coba episode lain.");
                            }}
                        >
                            <source src={currentEpisode.url} type="video/mp4" />
                            Browser Anda tidak mendukung tag video.
                        </video>
                    ) : (
                        <div className="flex items-center justify-center h-64 text-red-400">
                            Video tidak tersedia untuk episode ini
                        </div>
                    )}
                </div>

                {/* Drama Info */}
                <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-gray-300 mb-4">
                        {dramaData.info.description || "Tidak ada deskripsi tersedia."}
                    </p>
                    
                    {dramaData.info.category && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {dramaData.info.category.split(', ').map((tag, index) => (
                                <span key={index} className="bg-gray-700 text-xs px-2 py-1 rounded-full">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                    
                    <h3 className="text-lg font-bold border-t border-gray-700 pt-4">
                        Daftar Episode ({dramaData.episodes.length}):
                    </h3>
                    
                    <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-12 gap-2 mt-2 max-h-48 overflow-y-auto">
                        {dramaData.episodes.map(ep => (
                            <button
                                key={ep.episodeNumber}
                                onClick={() => handleEpisodeChange(ep)}
                                disabled={!ep.url}
                                className={`w-full p-2 rounded text-center transition-colors text-xs ${
                                    currentEpisode.episodeNumber === ep.episodeNumber 
                                        ? 'bg-red-600 font-bold text-white' 
                                        : ep.url 
                                            ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                                            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                                }`}
                            >
                                {ep.title.replace('EP ', '')}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
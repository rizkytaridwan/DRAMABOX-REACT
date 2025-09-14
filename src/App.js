// src/App.js

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// --- Komponen Individual ---
const LoadingSpinner = () => ( <div className="flex justify-center items-center p-8"><div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div></div> );
const ErrorMessage = ({ message }) => ( <div className="bg-red-900 text-red-200 p-4 rounded-lg text-center"><p><strong>Oops! Terjadi Kesalahan</strong></p><p>{message}</p></div> );

const DramaCard = ({ drama, onClick }) => (
    <div 
        className="bg-gray-800 rounded-lg overflow-hidden shadow-lg transform hover:-translate-y-2 transition-transform duration-300 cursor-pointer group"
        onClick={() => onClick(drama)}
    >
        <div className="relative">
            <img 
                src={drama.imageUrl} 
                alt={drama.title} 
                className="w-full h-64 object-cover" 
                onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/400x600/1f2937/9ca3af?text=Image+Error'; }} 
            />
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent"></div>
            {drama.chapterCount > 0 && (
                <div className="absolute top-2 right-2 bg-red-600/90 text-white text-xs font-bold px-2 py-1 rounded-md">
                    EP {drama.chapterCount}
                </div>
            )}
            {drama.playCount && (
                <div className="absolute bottom-2 left-2 flex items-center bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.022 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                    {drama.playCount}
                </div>
            )}
        </div>
        <div className="p-3">
            <h3 className="text-md font-bold truncate">{drama.title}</h3>
            <p className="text-xs text-gray-400">{drama.category}</p>
        </div>
    </div>
);


// --- Komponen Utama Aplikasi ---
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001';

export default function App() {
    // --- STATE MANAGEMENT ---
    const [dramas, setDramas] = useState([]);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isMoreLoading, setIsMoreLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    
    const navigate = useNavigate(); // Hook untuk navigasi

    // --- FUNGSI HELPERS & FETCH ---
    const formatDramaData = (item) => ({
        id: item.bookId,
        title: item.bookName,
        imageUrl: item.coverWap || item.cover,
        description: item.introduction,
        category: item.tag || (item.tags ? item.tags.join(', ') : '') || (item.tagNames ? item.tagNames.join(', ') : ''),
        chapterCount: item.chapterCount,
        playCount: item.playCount
    });

  const fetchLatestDramas = useCallback(async (pageNum) => {
        if (pageNum === 1) setIsLoading(true);
        else setIsMoreLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE_URL}/api/latest`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ pageNo: pageNum })
            });

            if (!response.ok) throw new Error(`Gagal mengambil data. Status: ${response.status}`);
            const result = await response.json();
            if (result.success === false) throw new Error(result.message || "API mengembalikan error.");

            const newDramas = result.data.newTheaterList.records.map(formatDramaData);
            setDramas(prevDramas => pageNum === 1 ? newDramas : [...prevDramas, ...newDramas]);

        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
            setIsMoreLoading(false);
        }
    }, []);

    const searchDramas = useCallback(async (keyword) => {
        if (!keyword) return;
        setIsLoading(true);
        setError(null);
        setIsSearching(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keyword })
            });
            if (!response.ok) throw new Error('Pencarian gagal.');
            const result = await response.json();
            if (result.success === false) throw new Error(result.message || "Pencarian API gagal.");
            
            const formattedResults = result.data.suggestList.map(formatDramaData);
            setDramas(formattedResults);
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);
    
    // --- EVENT HANDLERS ---
    const handleLoadMore = () => setPage(prevPage => prevPage + 1);
    const handleSearchChange = (e) => setSearchTerm(e.target.value);
    
const handleSelectDrama = useCallback(async (drama) => {
    setError(null);         // <-- 1. Bersihkan error sebelumnya
    setIsNavigating(true);  // <-- 2. Aktifkan loading navigasi

    try {
        const response = await fetch(`${API_BASE_URL}/api/stream-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookId: String(drama.id) })
        });
        if (!response.ok) throw new Error('Gagal memuat daftar episode.');
        const result = await response.json();
        if (result.success === false) throw new Error(result.message || "Gagal mendapatkan daftar episode.");

        navigate(`/player/${drama.id}`, {
            state: {
                dramaInfo: drama,
                episodes: result.episodes || [],
                selectedEpisode: result.episodes[0]
            }
        });
    } catch (err) {
        setError(err.message); // <-- Atur error jika fetch gagal
    } finally {
        setIsNavigating(false); // <-- 3. Selalu matikan loading setelah selesai
    }
}, [navigate]);
    
    // --- EFFECTS ---
    useEffect(() => {
        if (!isSearching) {
            fetchLatestDramas(page);
        }
    }, [page, isSearching, fetchLatestDramas]);

    useEffect(() => {
        const handler = setTimeout(() => {
            if (searchTerm) {
                searchDramas(searchTerm);
            } else if (isSearching) {
                setIsSearching(false);
                setPage(1);
            }
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm, isSearching, searchDramas]);

    // --- RENDER ---
    return (
        <div className="bg-gray-900 min-h-screen text-white font-sans">
            {isNavigating && (
            <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
                <div className="flex flex-col items-center">
                    <LoadingSpinner />
                    <p className="mt-4 text-lg">Memuat Episode...</p>
                </div>
            </div>
        )}
            <main className="container mx-auto px-4 py-8">
                <header className="text-center mb-8">
                    <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                        DramaBoxFinder
                    </h1>
                    <p className="text-gray-400 mt-2">Temukan drama favoritmu.</p>
                </header>
                
                <div className="mb-8 max-w-lg mx-auto">
                    <input type="text" placeholder="Cari judul drama..." value={searchTerm} onChange={handleSearchChange} className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
                </div>
                
                {isLoading && <LoadingSpinner />}
                {error && <ErrorMessage message={error} />}
                
                {!isLoading && !error && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        {dramas.length > 0 ? (
                            dramas.map(drama => (
                                <DramaCard key={`${drama.id}-${Math.random()}`} drama={drama} onClick={handleSelectDrama} />
                            ))
                        ) : (
                            <p className="col-span-full text-center text-gray-500">
                                {searchTerm ? "Tidak ada drama yang cocok ditemukan." : "Gagal memuat drama."}
                            </p>
                        )}
                    </div>
                )}
                
                {!isLoading && !error && !isSearching && dramas.length > 0 && (
                    <div className="text-center mt-10">
                        <button 
                            onClick={handleLoadMore}
                            disabled={isMoreLoading}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-full transition-colors duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                            {isMoreLoading ? 'Memuat...' : 'Memuat Lebih Banyak Drama'}
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
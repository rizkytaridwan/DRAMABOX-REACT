import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Token cache dengan perbaikan
let tokenCache = {
    data: null,
    timestamp: 0
};

const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 menit

// Fungsi untuk mendapatkan token dengan error handling yang lebih baik
const getCachedToken = async ({ forceRefresh = false } = {}) => { // <-- Tambahkan parameter forceRefresh
    const now = Date.now();
    
    // Cek cache, TAPI abaikan jika forceRefresh true
    if (!forceRefresh && tokenCache.data && (now - tokenCache.timestamp < CACHE_DURATION_MS)) {
        console.log("[LOG] Menggunakan token dari cache.");
        return tokenCache.data;
    }

    try {
        console.log(forceRefresh ? "[LOG] MEMAKSA mengambil token baru..." : "[LOG] Mengambil token baru (cache expired)...");
        const res = await axios.get("https://dramabox-token.vercel.app/token", {
            timeout: 10000 
        });
        
        if (!res.data || !res.data.token || !res.data.deviceid) {
            throw new Error("Response token tidak valid");
        }
        
        // Update cache
        tokenCache = {
            data: res.data,
            timestamp: Date.now()
        };
        
        console.log("[LOG] Token baru berhasil disimpan ke cache.");
        return tokenCache.data;
        
    } catch (error) {
        console.error("[ERROR] Gagal mendapatkan token:", error.message);
        
        // Jika masih ada token lama (meskipun expired), coba gunakan dulu
        if (tokenCache.data) {
            console.log("[LOG] Menggunakan token lama karena gagal refresh.");
            return tokenCache.data;
        }
        
        throw new Error(`Gagal mendapatkan token: ${error.message}`);
    }
};

const createHeaders = (tokenData) => ({
    "User-Agent": "okhttp/4.10.0",
    "Accept-Encoding": "gzip",
    "tn": `Bearer ${tokenData.token}`,
    "version": "430",
    "vn": "4.3.0",
    "cid": "DRA1000042",
    "package-name": "com.storymatrix.drama",
    "apn": "1",
    "device-id": tokenData.deviceid,
    "language": "in",
    "current-language": "in",
    "p": "43",
    "time-zone": "+0800",
    "Content-Type": "application/json; charset=UTF-8"
});

// Fungsi helper untuk retry request
const retryRequest = async (requestFn, maxRetries = 2) => {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await requestFn();
        } catch (error) {
            console.log(`[LOG] Percobaan ${i + 1} gagal:`, error.message);
            
            if (i === maxRetries) {
                throw error;
            }
            
            // Force refresh token untuk retry berikutnya
            if (error.response?.status === 401 || error.response?.status === 403) {
                console.log("[LOG] Token mungkin invalid, force refresh...");
                tokenCache.timestamp = 0; // Reset timestamp untuk force refresh
            }
            
            // Tunggu sebentar sebelum retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
};

// 1. Endpoint untuk mendapatkan drama terbaru
app.post('/api/latest', async (req, res) => {
    try {
        const requestFn = async () => {
            // PANGGILAN NORMAL (MENGGUNAKAN CACHE)
            const gettoken = await getCachedToken(); // <-- TANPA forceRefresh
            const url = "https://sapi.dramaboxdb.com/drama-box/he001/theater";
            // ... sisa kode di endpoint ini tetap sama
            const headers = createHeaders(gettoken);
            const page = req.body.pageNo || 1;
            console.log(`[LOG] POST /api/latest: Halaman ${page}`);
            const data = {
                newChannelStyle: 1,
                isNeedRank: 1,
                pageNo: parseInt(page),
                index: (parseInt(page) - 1) * 20,
                channelId: 43
            };
            return await axios.post(url, data, { headers, timeout: 15000 });
        };

        const response = await retryRequest(requestFn);
        res.json(response.data);
        
    } catch (error) {
        console.error("[ERROR] /api/latest:", error.message);
        res.status(500).json({ success: false, message: "Gagal mengambil data drama terbaru.", error: error.message });
    }
});

// 2. Endpoint untuk pencarian
app.post('/api/search', async (req, res) => {
    // ... (validasi keyword tetap sama)
    try {
        const requestFn = async () => {
            // PANGGILAN NORMAL (MENGGUNAKAN CACHE)
            const gettoken = await getCachedToken(); // <-- TANPA forceRefresh
            // ... sisa kode di endpoint ini tetap sama
            const url = "https://sapi.dramaboxdb.com/drama-box/search/suggest";
            const headers = createHeaders(gettoken);
            const data = { keyword: req.body.keyword };
            return await axios.post(url, data, { headers, timeout: 15000 });
        };

        const response = await retryRequest(requestFn);
        res.json(response.data);
        
    } catch (error) {
        console.error("[ERROR] /api/search:", error.message);
        res.status(500).json({ success: false, message: "Gagal melakukan pencarian.", error: error.message });
    }
});

// 3. Endpoint untuk mendapatkan link stream
app.post('/api/stream-link', async (req, res) => {
    const { bookId } = req.body;
    if (!bookId) {
        return res.status(400).json({ 
            success: false, 
            message: "bookId diperlukan." 
        });
    }

    try {
        const requestFn = async () => {
            const gettoken = await getCachedToken({ forceRefresh: true });
            const url = "https://sapi.dramaboxdb.com/drama-box/chapterv2/batch/load";
            const headers = createHeaders(gettoken);
            
            const baseData = {
                boundaryIndex: 0,
                comingPlaySectionId: -1,
                currencyPlaySource: "discover_new_rec_new",
                needEndRecommend: 0,
                currencyPlaySourceName: "",
                preLoad: false,
                rid: "",
                pullCid: "",
                loadDirection: 0,
                startUpKey: "",
                bookId: String(bookId),
            };

            const initialRequestData = { ...baseData, index: 1 };
            
            console.log(`[LOG] Mengambil episode untuk bookId: ${bookId}`);
            
            return await axios.post(url, initialRequestData, { 
                headers,
                timeout: 20000 
            });
        };

        const initialResponse = await retryRequest(requestFn);
        const initialData = initialResponse.data?.data;
        
        if (!initialData || !initialData.chapterList || initialData.chapterList.length === 0) {
            throw new Error("Daftar episode tidak ditemukan.");
        }

        const firstBatch = initialData.chapterList;
        const totalEpisodes = initialData.chapterCount;
        const batchSize = firstBatch.length;
        let allEpisodes = [...firstBatch];

        // Ambil episode tambahan jika ada
        if (totalEpisodes > batchSize) {
            const additionalRequestFn = async (nextIndex) => {
               const gettoken = await getCachedToken({ forceRefresh: true });
                const headers = createHeaders(gettoken);
                const requestData = { 
                    boundaryIndex: 0,
                    comingPlaySectionId: -1,
                    currencyPlaySource: "discover_new_rec_new",
                    needEndRecommend: 0,
                    currencyPlaySourceName: "",
                    preLoad: false,
                    rid: "",
                    pullCid: "",
                    loadDirection: 0,
                    startUpKey: "",
                    bookId: String(bookId),
                    index: nextIndex 
                };
                
                return await axios.post(
                    "https://sapi.dramaboxdb.com/drama-box/chapterv2/batch/load", 
                    requestData, 
                    { headers, timeout: 20000 }
                );
            };

            const requests = [];
            for (let nextIndex = batchSize + 1; nextIndex <= totalEpisodes; nextIndex += batchSize) {
                requests.push(retryRequest(() => additionalRequestFn(nextIndex)));
            }

            const additionalResponses = await Promise.all(requests);
            additionalResponses.forEach(response => {
                const chapterList = response.data?.data?.chapterList;
                if (chapterList) {
                    allEpisodes.push(...chapterList);
                }
            });
        }

        // Process episodes
        const processedEpisodes = allEpisodes.map(chapter => {
            const cdnData = chapter.cdnList?.[0];
            const videoList = cdnData?.videoPathList;
            
            if (!videoList || videoList.length === 0) return null;
            
            let streamUrl = videoList.find(video => video.isDefault === 1)?.videoPath || videoList[0]?.videoPath;
            
            return {
                episodeNumber: chapter.chapterId,
                title: chapter.chapterName,
                url: streamUrl,
            };
        }).filter(ep => ep && ep.url);

        processedEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        
        console.log(`[LOG] Berhasil memproses ${processedEpisodes.length} episode untuk bookId: ${bookId}`);
        
        res.json({ 
            success: true, 
            episodes: processedEpisodes,
            bookId: bookId 
        });
        
    } catch (error) {
        console.error(`[ERROR] /api/stream-link untuk bookId ${bookId}:`, error.message);
        
        const errorMessage = error.response ? 
            `API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}` : 
            error.message;
            
        res.status(500).json({ 
            success: false, 
            message: "Gagal memproses link stream.", 
            error: errorMessage,
            bookId: bookId 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        tokenCacheAge: Date.now() - tokenCache.timestamp 
    });
});

/*
app.listen(PORT, () => {
    console.log(`🚀 Backend proxy berjalan di http://localhost:${PORT}`);
    console.log(`📊 Health check tersedia di http://localhost:${PORT}/health`);
});
*/
export default app;
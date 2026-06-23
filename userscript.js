// ==UserScript==
// @name         AnimePahe OP/ED Skip (Dual-Engine)
// @namespace    https://github.com/surajklmn/animephahe-aniskip
// @version      2.1
// @description  Skip Openings, Endings, and Recaps on AnimePahe using Anime Skip (AniList) and AniSkip (MAL) APIs.
// @author       Crab
// @match        *://*.animepahe.ru/*
// @match        *://*.animepahe.com/*
// @match        *://*.animepahe.org/*
// @match        *://*.animepahe.pw/*
// @match        *://*.kwik.cx/*
// @match        *://*.kwik.si/*
// @match        *://*.kwik.pw/*
// // To enable Universal or other sites (like Miruro), uncomment the match below:
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const href = window.location.href;
    const isIframe = window.self !== window.top;

    // Fast exit check to avoid running on unrelated websites
    // Only runs on AnimePahe parent or iframes (which might be the player, e.g. Kwik)
    const isSupportedParent = href.includes('animepahe.');
    // To enable Miruro or Universal matching, uncomment the line below:
    // const isSupportedParent = href.includes('animepahe.') || href.includes('miruro.') || isWatchPage();
    
    const isSupportedIframe = isIframe && (href.includes('kwik.cx') || href.includes('kwik.si') || href.includes('kwik.pw'));
    // To enable any iframe player (e.g. for Miruro or Universal), uncomment the line below:
    // const isSupportedIframe = isIframe;

    if (!isSupportedParent && !isSupportedIframe) {
        return; // Exit immediately if on an unrelated page
    }

    if (isSupportedParent) {
        runParent();
    }

    if (isSupportedIframe || isSupportedParent) {
        runPlayer();
    }

    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================
    // function isWatchPage() {
    // const title = document.title.toLowerCase();
    // const url = window.location.href.toLowerCase();
    // 
    // // Keywords in URL
    // const hasWatchUrl = url.includes('/watch') || url.includes('/play') || url.includes('/episode') || url.includes('-episode') || url.includes('?ep=') || url.includes('/watch-');
    // // Keywords in Title
    // const hasWatchTitle = title.includes('episode') || title.includes('ep ') || title.includes('ep.') || title.includes('watch anime');
    // 
    // return hasWatchUrl || hasWatchTitle;
    // }

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // ==========================================
    // TITLE PARSER AND ANILIST SEARCH
    // ==========================================
    // function parseGenericTitle(title, url) {
    // // Clean common site suffixes from the title first
    // let cleaned = title
    // .replace(/HD\s*$/i, '')
    // .replace(/English\s+(Sub|Dub|Subbed|Dubbed)\b.*/i, '')
    // .replace(/Sub|Dub|Subbed|Dubbed/i, '')
    // .replace(/\b(?:online|free|stream|watch)\b/gi, '')
    // .trim();
    // 
    // // Look for episode indicators
    // let episodeNum = null;
    // let animeName = cleaned;
    // 
    // // Matches: "Episode 12", "Ep 12", "Ep.12", "Episode-12"
    // const epRegexes = [
    // /\b(?:episode|ep|ep\.)\s*([\d\.]+)/i,
    // /\s+-\s+([\d\.]+)\b/,       // "Anime Name - 12"
    // /\b(?:episode|ep|ep\.)-([\d\.]+)/i
    // ];
    // 
    // // Try URL first for episode number (often cleaner)
    // const urlMatch = url.match(/\/episode-([\d\.]+)/i) || url.match(/[?&](?:ep|episode)=([\d\.]+)/i);
    // if (urlMatch) {
    // episodeNum = parseFloat(urlMatch[1]);
    // }
    // 
    // for (const regex of epRegexes) {
    // const match = cleaned.match(regex);
    // if (match) {
    // if (episodeNum === null) episodeNum = parseFloat(match[1]);
    // // The anime name is usually everything before the episode match
    // const idx = cleaned.indexOf(match[0]);
    // if (idx > 0) {
    // animeName = cleaned.substring(0, idx).trim();
    // }
    // break;
    // }
    // }
    // 
    // // If still no episode number found, look for any trailing number
    // if (episodeNum === null) {
    // const trailingNumMatch = cleaned.match(/\b(\d+)\s*$/);
    // if (trailingNumMatch) {
    // episodeNum = parseFloat(trailingNumMatch[1]);
    // animeName = cleaned.replace(/\b\d+\s*$/, '').trim();
    // }
    // }
    // 
    // // Final cleanup of the anime name
    // animeName = animeName
    // .replace(/^[-\s:|]+|[ -\s:|]+$/g, '') // remove leading/trailing punctuation
    // .trim();
    // 
    // return { animeName, episodeNum };
    // }
    // 
    // async function searchAniList(name) {
    // const query = `
    // query ($search: String) {
    // Media (search: $search, type: ANIME) {
    // id
    // idMal
    // }
    // }
    // `;
    // 
    // try {
    // const response = await fetch("https://graphql.anilist.co", {
    // method: "POST",
    // headers: {
    // "Content-Type": "application/json"
    // },
    // body: JSON.stringify({
    // query,
    // variables: { search: name }
    // })
    // });
    // if (!response.ok) return null;
    // const resJson = await response.json();
    // const media = resJson.data?.Media;
    // if (media) {
    // return { anilistId: media.id, malId: media.idMal };
    // }
    // } catch (e) {
    // console.error("[AniSkip] Error searching AniList:", e);
    // }
    // return null;
    // }

    // async function fetchMalIdFromAniList(anilistId) {
    //     const query = `
    //     query ($id: Int) {
    //       Media (id: $id, type: ANIME) {
    //         idMal
    //       }
    //     }
    //     `;
    // 
    //     try {
    //         const response = await fetch("https://graphql.anilist.co", {
    //             method: "POST",
    //             headers: {
    //                 "Content-Type": "application/json"
    //             },
    //             body: JSON.stringify({
    //                 query,
    //                 variables: { id: parseInt(anilistId) }
    //             })
    //         });
    //         if (!response.ok) return null;
    //         const resJson = await response.json();
    //         return resJson.data?.Media?.idMal || null;
    //     } catch (e) {
    //         console.error("[AniSkip] Error fetching MAL ID from AniList:", e);
    //     }
    //     return null;
    // }

    // ==========================================
    // METADATA RESOLUTION
    // ==========================================
    async function resolvePlayerMetadata() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // 1. Check URL parameters (e.g. kwik iframe src parameters)
        const malId = urlParams.get('malId');
        const anilistId = urlParams.get('anilistId');
        const episodeNum = urlParams.get('episode');
        if ((malId || anilistId) && episodeNum) {
            return { malId, anilistId, episodeNum: parseFloat(episodeNum) };
        }

        // 2. Check if we are on a supported parent page and can parse it directly from the URL
        if (isSupportedParent) {
            // if (href.includes('miruro.')) {
            //     // Miruro URL format: /watch/[anilistId]?ep=[episodeNum]
            //     const matchId = window.location.pathname.match(/\/watch\/(\d+)/);
            //     const matchEp = urlParams.get('ep');
            //     if (matchId && matchEp) {
            //         const parsedAnilistId = matchId[1];
            //         const cacheKey = `mal_id_from_anilist_${parsedAnilistId}`;
            //         const cachedMalId = GM_getValue(cacheKey);
            //         return { malId: cachedMalId || null, anilistId: parsedAnilistId, episodeNum: parseFloat(matchEp) };
            //     }
            // } else
            if (href.includes('animepahe.')) {
                // AnimePahe parent URL format: /play/[animeHash]/[episodeHash]
                const pathParts = window.location.pathname.split('/');
                if (pathParts[1] === 'play') {
                    const episodeHash = pathParts[3];
                    if (episodeHash) {
                        const info = GM_getValue(`info_${episodeHash}`);
                        if (info) {
                            return { malId: info.malId, anilistId: info.anilistId, episodeNum: info.episodeNum };
                        }
                    }
                }
            }
        }

        // // 3. Fallback: Read the global session bridge (active_anime_info)
        // // This is crucial for cross-origin iframes on sites like Miruro or others (e.g. kiwi player, player2)
        // const activeInfo = GM_getValue('active_anime_info');
        // if (activeInfo && activeInfo.timestamp) {
        // const timeDiff = Date.now() - activeInfo.timestamp;
        // if (timeDiff < 20000) { // Fresh session within 20 seconds
        // return {
        // malId: activeInfo.malId,
        // anilistId: activeInfo.anilistId,
        // episodeNum: activeInfo.episodeNum
        // };
        // }
        // }

        return null;
    }

    // ==========================================
    // PARENT PAGE LOGIC (animepahe / miruro / generic)
    // ==========================================
    async function runParent() {
        console.log("[AniSkip] Parent script started");
        
        let anilistId = null;
        let malId = null;
        let episodeNum = null;

        // if (href.includes('miruro.')) {
        //     // Miruro Watch Page detected
        //     const matchId = window.location.pathname.match(/\/watch\/(\d+)/);
        //     const urlParams = new URLSearchParams(window.location.search);
        //     const matchEp = urlParams.get('ep');
        //     
        //     if (matchId && matchEp) {
        //         anilistId = matchId[1];
        //         episodeNum = parseFloat(matchEp);
        //         console.log(`[AniSkip] Miruro Watch Page detected: AniList ID ${anilistId}, Episode ${episodeNum}`);
        //         
        //         // Try to resolve and cache MAL ID
        //         const cacheKey = `mal_id_from_anilist_${anilistId}`;
        //         malId = GM_getValue(cacheKey);
        //         if (!malId) {
        //             malId = await fetchMalIdFromAniList(anilistId);
        //             if (malId) {
        //                 GM_setValue(cacheKey, malId);
        //             }
        //         }
        //     }
        // } else
        if (href.includes('animepahe.')) {
            // AnimePahe Watch Page detected
            const pathParts = window.location.pathname.split('/');
            if (pathParts[1] !== 'play') return;

            const animeHash = pathParts[2];
            const episodeHash = pathParts[3];
            if (!animeHash || !episodeHash) return;

            // Wait for details link to load
            const animeLink = await waitForElement('.theatre-info h1 a');
            if (animeLink) {
                const detailsPath = animeLink.getAttribute('href');
                console.log(`[AniSkip] Resolved details path: ${detailsPath}`);

                const ids = await getAnimeIds(animeHash, detailsPath);
                episodeNum = await getEpisodeNumber();
                anilistId = ids.anilistId;
                malId = ids.malId;

                if (anilistId || malId) {
                    saveEpisodeInfo(episodeHash, {
                        malId: malId,
                        anilistId: anilistId,
                        episodeNum: episodeNum,
                        timestamp: Date.now()
                    });
                    updateIframeSrc(malId, anilistId, episodeNum);
                }
            }
        }
        // } else {
        //     // Universal Generic Fallback
        //     if (isWatchPage()) {
        //         console.log("[AniSkip] Generic Watch Page detected. Attempting to parse title...");
        //         // We use document.title and URL to resolve the anime name and episode number
        //         const parsed = parseGenericTitle(document.title, window.location.href);
        //         if (parsed.animeName && parsed.episodeNum !== null) {
        //             console.log(`[AniSkip] Parsed: "${parsed.animeName}" (Episode ${parsed.episodeNum}). Searching AniList...`);
        //             
        //             const cacheKey = `anilist_search_${parsed.animeName.replace(/\s+/g, '_').toLowerCase()}`;
        //             const cachedIds = GM_getValue(cacheKey);
        //             
        //             let ids = null;
        //             if (cachedIds) {
        //                 ids = cachedIds;
        //             } else {
        //                 ids = await searchAniList(parsed.animeName);
        //                 if (ids) {
        //                     GM_setValue(cacheKey, ids);
        //                 }
        //             }
        //             
        //             if (ids) {
        //                 anilistId = ids.anilistId;
        //                 malId = ids.malId;
        //                 episodeNum = parsed.episodeNum;
        //                 console.log(`[AniSkip] Resolved AniList ID ${anilistId}, MAL ID ${malId} for "${parsed.animeName}"`);
        //             } else {
        //                 console.warn(`[AniSkip] Could not resolve IDs for "${parsed.animeName}"`);
        //             }
        //         }
        //     }
        // }

        // // Save resolved metadata to active session bridge
        // if ((anilistId || malId) && episodeNum !== null) {
        // GM_setValue('active_anime_info', {
        // malId: malId,
        // anilistId: anilistId,
        // episodeNum: episodeNum,
        // timestamp: Date.now()
        // });
        // console.log(`[AniSkip] Updated active session bridge: AniList ${anilistId}, MAL ${malId}, Ep ${episodeNum}`);
        // }
    }

    async function getAnimeIds(animeHash, detailsPath) {
        const cachedMal = GM_getValue(`mal_id_${animeHash}`);
        const cachedAnilist = GM_getValue(`anilist_id_${animeHash}`);
        if (cachedMal || cachedAnilist) {
            console.log(`[AniSkip] Using cached IDs - MAL: ${cachedMal}, AniList: ${cachedAnilist}`);
            return { malId: cachedMal, anilistId: cachedAnilist };
        }

        try {
            console.log(`[AniSkip] Fetching IDs from details page: ${detailsPath}`);
            const response = await fetch(detailsPath);
            if (!response.ok) throw new Error("Failed to fetch details page");
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Find AniList ID
            const anilistLink = doc.querySelector('a[href*="anilist.co/anime/"]');
            let anilistId = null;
            if (anilistLink) {
                const match = anilistLink.href.match(/\/anime\/(\d+)/);
                if (match) {
                    anilistId = match[1];
                    GM_setValue(`anilist_id_${animeHash}`, anilistId);
                }
            }

            // Find MyAnimeList ID
            const malLink = doc.querySelector('a[href*="myanimelist.net/anime/"]');
            let malId = null;
            if (malLink) {
                const match = malLink.href.match(/\/anime\/(\d+)/);
                if (match) {
                    malId = match[1];
                    GM_setValue(`mal_id_${animeHash}`, malId);
                }
            }

            console.log(`[AniSkip] Resolved IDs - MAL: ${malId}, AniList: ${anilistId}`);
            return { malId, anilistId };
        } catch (e) {
            console.error("[AniSkip] Error fetching details page IDs:", e);
        }
        return { malId: null, anilistId: null };
    }

    async function getEpisodeNumber() {
        for (let i = 0; i < 50; i++) {
            const heading = document.querySelector('.theatre-info h1');
            if (heading && heading.textContent.includes('Episode')) {
                const match = heading.textContent.match(/Episode\s+([\d\.]+)/i);
                if (match) return parseFloat(match[1]);
            }
            const matchTitle = document.title.match(/Episode\s+([\d\.]+)/i);
            if (matchTitle) return parseFloat(matchTitle[1]);

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const heading = document.querySelector('.theatre-info h1');
        if (heading) {
            const match = heading.textContent.match(/Episode\s+([\d\.]+)/i);
            if (match) return parseFloat(match[1]);
        }
        const matchTitle = document.title.match(/Episode\s+([\d\.]+)/i);
        if (matchTitle) return parseFloat(matchTitle[1]);

        return 1;
    }

    async function updateIframeSrc(malId, anilistId, episodeNum) {
        const iframe = await waitForElement('iframe[src*="kwik.cx/e/"], iframe[src*="kwik.cx/f/"], iframe[src*="kwik.si/e/"], iframe[src*="kwik.si/f/"], iframe[src*="kwik.pw/e/"], iframe[src*="kwik.pw/f/"]');
        if (!iframe) {
            console.warn("[AniSkip] Kwik player iframe not found in DOM.");
            return;
        }

        const src = iframe.getAttribute('src');
        if (src && !src.includes('episode=')) {
            const url = new URL(src);
            if (malId) url.searchParams.set('malId', malId);
            if (anilistId) url.searchParams.set('anilistId', anilistId);
            url.searchParams.set('episode', episodeNum);
            iframe.setAttribute('src', url.toString());
            console.log(`[AniSkip] Injected parameters into iframe src: ${url.toString()}`);
        }
    }

    function saveEpisodeInfo(episodeHash, info) {
        GM_setValue(`info_${episodeHash}`, info);
        let keys = GM_getValue('stored_info_keys', []);
        if (!keys.includes(episodeHash)) {
            keys.push(episodeHash);
        }
        while (keys.length > 50) {
            const oldKey = keys.shift();
            GM_setValue(`info_${oldKey}`, undefined);
        }
        GM_setValue('stored_info_keys', keys);
    }

    // ==========================================
    // PLAYER CONTROLLER LOGIC
    // ==========================================
    function runPlayer() {
        console.log("[AniSkip] Player controller checker started");
        
        // Wait for video element in DOM
        const video = document.querySelector('video');
        if (!video) {
            const observer = new MutationObserver((mutations, obs) => {
                const vid = document.querySelector('video');
                if (vid) {
                    obs.disconnect();
                    setupPlayer(vid);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            setupPlayer(video);
        }
    }

    async function setupPlayer(video) {
        console.log("[AniSkip] Video element detected. Resolving metadata...");
        
        // Poll for metadata to become available (e.g., waiting for parent page API fetch or storage write)
        let metadata = null;
        for (let i = 0; i < 50; i++) { // Poll for up to 5 seconds
            metadata = await resolvePlayerMetadata();
            if (metadata) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!metadata) {
            console.warn("[AniSkip] Failed to resolve metadata for this video player.");
            return;
        }

        console.log(`[AniSkip] Resolved metadata: MAL ${metadata.malId}, AniList ${metadata.anilistId}, Ep ${metadata.episodeNum}`);
        
        // Initialize video controls and fetching sequentially
        initVideoControls(video, metadata);
    }

    async function initVideoControls(video, metadata) {
        // Wait for video duration to be loaded
        let duration = Math.round(video.duration);
        if (isNaN(duration) || duration === 0) {
            duration = await new Promise((resolve) => {
                video.addEventListener('loadedmetadata', () => {
                    resolve(Math.round(video.duration));
                }, { once: true });
                // Fallback timeout in case loadedmetadata doesn't fire or is delayed
                setTimeout(() => resolve(Math.round(video.duration) || 1440), 3000);
            });
        }

        let segments = null;

        // 1. Try AniSkip (MAL) first (Curated highly accurate database)
        if (metadata.malId) {
            console.log(`[AniSkip] Fetching skip times from AniSkip API (MAL ID: ${metadata.malId}, Episode: ${metadata.episodeNum}, Duration: ${duration})...`);
            segments = await fetchAniSkipTimes(metadata.malId, metadata.episodeNum, duration);
        }

        // 2. Fallback to Anime Skip (AniList) if AniSkip has no data or is offline
        if ((!segments || segments.length === 0) && metadata.anilistId) {
            console.log(`[AniSkip] Falling back to Anime Skip API (AniList ID: ${metadata.anilistId}, Episode: ${metadata.episodeNum})...`);
            segments = await fetchAnimeSkipTimes(metadata.anilistId, metadata.episodeNum);
        }

        if (!segments || segments.length === 0) {
            console.log("[AniSkip] No skip segments found from any database.");
            return;
        }

        start(video, segments);
    }

    async function start(video, segments) {
        console.log("[AniSkip] Active skip segments:", segments);

        injectStyles();
        const ui = createUI(video);

        let currentSegment = null;
        let lastTime = 0;
        let disableAutoSkipForCurrent = false;

        ui.autoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const newVal = !ui.isAutoSkip();
            ui.setAutoSkip(newVal);
            GM_setValue('auto_skip_enabled', newVal);
            ui.autoToggle.classList.toggle('active', newVal);

            if (newVal && currentSegment && !disableAutoSkipForCurrent) {
                video.currentTime = currentSegment.end !== null ? currentSegment.end : video.duration;
                video.play().catch(() => {});
                showNotification(`Auto-Skipped ${getSegmentName(currentSegment.type)}`);
                hideBtn();
            }
        });

        // High frequency checking function (100ms interval)
        function checkTime() {
            const currentTime = video.currentTime;
            const isSeeking = Math.abs(currentTime - lastTime) > 1.5;
            lastTime = currentTime;

            const activeSegment = segments.find(seg => currentTime >= seg.start && (seg.end === null || currentTime < (seg.end - 1)));

            if (activeSegment) {
                if (isSeeking) {
                    disableAutoSkipForCurrent = true;
                    showBtn(activeSegment);
                }

                if (currentSegment !== activeSegment) {
                    currentSegment = activeSegment;

                    if (ui.isAutoSkip() && !disableAutoSkipForCurrent) {
                        video.currentTime = activeSegment.end !== null ? activeSegment.end : video.duration;
                        video.play().catch(() => {});
                        showNotification(`Auto-Skipped ${getSegmentName(activeSegment.type)}`);
                        hideBtn();
                    } else {
                        showBtn(activeSegment);
                    }
                }
            } else {
                if (currentSegment) {
                    currentSegment = null;
                    disableAutoSkipForCurrent = false;
                    hideBtn();
                }
            }
        }

        // Set up high frequency checking
        let checkInterval = null;
        function startLoop() {
            if (!checkInterval) {
                checkInterval = setInterval(checkTime, 100);
            }
        }
        function stopLoop() {
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }
        }

        // Bind events
        video.addEventListener('play', startLoop);
        video.addEventListener('pause', stopLoop);
        video.addEventListener('seeking', checkTime);
        video.addEventListener('seeked', checkTime);
        video.addEventListener('timeupdate', checkTime);

        // Start checking immediately if video is already playing
        if (!video.paused) {
            startLoop();
        }
        // Run an initial check immediately
        checkTime();

        function showBtn(segment) {
            ui.mainBtn.querySelector('span').textContent = `Skip ${getSegmentName(segment.type)}`;
            ui.container.classList.add('visible');
            ui.mainBtn.onclick = (e) => {
                e.stopPropagation();
                video.currentTime = segment.end !== null ? segment.end : video.duration;
                video.play().catch(() => {});
                showNotification(`Skipped ${getSegmentName(segment.type)}`);
                hideBtn();
            };
        }

        function hideBtn() {
            ui.container.classList.remove('visible');
            ui.mainBtn.onclick = null;
        }

        function showNotification(text) {
            ui.notification.textContent = text;
            ui.notification.classList.add('visible');

            clearTimeout(ui.notification.timeout);
            ui.notification.timeout = setTimeout(() => {
                ui.notification.classList.remove('visible');
            }, 3000);
        }
    }

    // ==========================================
    // API ENGINES
    // ==========================================
    async function fetchAnimeSkipTimes(anilistId, episodeNum) {
        const query = `
        query {
          findShowsByExternalId(service: ANILIST, serviceId: "${anilistId}") {
            episodes {
              number
              timestamps {
                at
                type {
                  name
                }
              }
            }
          }
        }
        `;

        try {
            const response = await fetch("https://api.anime-skip.com/graphql", {
                method: "POST",
                headers: {
                    "X-Client-ID": "ZGfO0sMF3eCwLYf8yMSCJjlynwNGRXWE",
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ query })
            });
            if (!response.ok) return null;
            const resJson = await response.json();
            const shows = resJson.data?.findShowsByExternalId;
            if (!shows || shows.length === 0) return null;

            const episode = shows[0].episodes.find(ep => parseFloat(ep.number) === episodeNum);
            if (!episode || !episode.timestamps) return null;

            const sorted = [...episode.timestamps].sort((a, b) => a.at - b.at);
            const segments = [];
            const skipTypes = ["Intro", "New Intro", "Credits", "New Credits", "Mixed Credits", "Recap"];

            for (let i = 0; i < sorted.length; i++) {
                const current = sorted[i];
                if (skipTypes.includes(current.type.name)) {
                    const next = sorted[i + 1];
                    const start = current.at;
                    const end = next ? next.at : null;

                    let generalType = 'op';
                    if (current.type.name.includes('Credits')) generalType = 'ed';
                    else if (current.type.name.includes('Recap')) generalType = 'recap';

                    segments.push({
                        type: generalType,
                        start: start,
                        end: end
                    });
                }
            }
            return segments;
        } catch (e) {
            console.error("[AniSkip] Anime Skip API error:", e);
        }
        return null;
    }

    async function fetchAniSkipTimes(malId, episodeNum, duration) {
        const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNum}?types[]=op&types[]=ed&types[]=recap&episodeLength=${duration}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.found && data.results) {
                return data.results.map(item => ({
                    type: item.skipType,
                    start: item.interval.startTime,
                    end: item.interval.endTime
                }));
            }
        } catch (e) {
            console.error("[AniSkip] AniSkip API error:", e);
        }
        return null;
    }

    function getSegmentName(type) {
        switch(type) {
            case 'op': return 'Opening';
            case 'ed': return 'Ending';
            case 'recap': return 'Recap';
            default: return 'Intro';
        }
    }

    // ==========================================
    // STYLING AND UI CREATION
    // ==========================================
    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .aniskip-container {
                position: absolute;
                right: 30px;
                bottom: 80px;
                display: flex;
                align-items: center;
                z-index: 2147483647;
                opacity: 0;
                transform: translateY(10px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: none;
            }
            .aniskip-container.visible {
                opacity: 1;
                transform: translateY(0);
                pointer-events: auto;
            }
            .aniskip-main-btn {
                background: rgba(15, 15, 15, 0.85);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                color: #ffffff;
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 10px 18px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                font-weight: 700;
                border-radius: 8px 0 0 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
                letter-spacing: 0.5px;
                display: flex;
                align-items: center;
                gap: 8px;
                text-transform: uppercase;
            }
            .aniskip-main-btn:hover {
                background: #00d1b2;
                border-color: #00d1b2;
                color: #000000;
                box-shadow: 0 0 15px rgba(0, 209, 178, 0.5);
            }
            .aniskip-auto-toggle {
                background: rgba(15, 15, 15, 0.85);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                color: rgba(255, 255, 255, 0.6);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-left: none;
                padding: 10px 12px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 11px;
                font-weight: 700;
                border-radius: 0 8px 8px 0;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
                text-transform: uppercase;
            }
            .aniskip-auto-toggle:hover {
                background: rgba(30, 30, 30, 0.95);
                color: #ffffff;
            }
            .aniskip-auto-toggle.active {
                background: rgba(0, 209, 178, 0.2);
                color: #00d1b2;
                border-color: rgba(0, 209, 178, 0.4);
            }
            .aniskip-auto-toggle.active:hover {
                background: rgba(0, 209, 178, 0.3);
            }
            .aniskip-notification {
                position: absolute;
                top: 25px;
                left: 50%;
                transform: translateX(-50%) translateY(-20px);
                background: rgba(0, 209, 178, 0.95);
                color: #000000;
                padding: 10px 24px;
                border-radius: 30px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 13px;
                font-weight: 700;
                box-shadow: 0 4px 20px rgba(0, 209, 178, 0.4);
                z-index: 2147483647;
                opacity: 0;
                pointer-events: none;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .aniskip-notification.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    function createUI(video) {
        const parent = video.parentElement || document.body;

        const container = document.createElement('div');
        container.className = 'aniskip-container';

        const mainBtn = document.createElement('button');
        mainBtn.className = 'aniskip-main-btn';
        mainBtn.innerHTML = `
            <svg class="aniskip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;width:14px;height:14px;">
                <polygon points="5 4 15 12 5 20 5 4"></polygon>
                <line x1="19" y1="5" x2="19" y2="19"></line>
            </svg>
            <span>Skip Intro</span>
        `;

        const autoToggle = document.createElement('button');
        autoToggle.className = 'aniskip-auto-toggle';
        autoToggle.textContent = 'Auto';

        let autoSkip = GM_getValue('auto_skip_enabled', false);
        if (autoSkip) {
            autoToggle.classList.add('active');
        }

        container.appendChild(mainBtn);
        container.appendChild(autoToggle);
        parent.appendChild(container);

        const notification = document.createElement('div');
        notification.className = 'aniskip-notification';
        parent.appendChild(notification);

        return {
            container,
            mainBtn,
            autoToggle,
            notification,
            isAutoSkip: () => autoSkip,
            setAutoSkip: (val) => { autoSkip = val; }
        };
    }
})();

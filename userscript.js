// ==UserScript==
// @name         AnimePahe OP/ED Skip (Dual-Engine)
// @namespace    https://github.com/surajklmn/animephahe-aniskip
// @version      2.4
// @description  Skip Openings, Endings, and Recaps on AnimePahe using Anime Skip (AniList) and AniSkip (MAL) APIs.
// @author       Crab
// @license      MIT
// @match        *://*.animepahe.ru/*
// @match        *://*.animepahe.com/*
// @match        *://*.animepahe.org/*
// @match        *://*.animepahe.pw/*
// @match        *://*.kwik.cx/*
// @match        *://*.kwik.si/*
// @match        *://*.kwik.pw/*
// To enable Universal or other sites (like Miruro), uncomment the match below:
// // @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ==========================================
    // CONSTANTS
    // ==========================================
    const LOG_PREFIX = '[AniSkip]';

    // Maximum/minimum reasonable durations (in seconds) for each segment type.
    const MAX_SEGMENT_DURATION = { op: 210, ed: 210, 'mixed-op': 210, 'mixed-ed': 210, recap: 300 };
    const MIN_SEGMENT_DURATION = 15;

    const href = window.location.href;

    if (href.includes('animepahe.')) {
        runParent();
    } else if (href.includes('kwik.cx/')) {
        runIframe();
    }

    // ==========================================
    // LOGGING HELPERS
    // ==========================================
    function log(...args) { console.log(LOG_PREFIX, ...args); }
    function warn(...args) { console.warn(LOG_PREFIX, ...args); }
    function error(...args) { console.error(LOG_PREFIX, ...args); }

    // ==========================================
    // HELPER FUNCTIONS
    // ==========================================
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

    /**
     * Reliably resolves the video duration, waiting for metadata if needed.
     * Returns duration in seconds (rounded), or 0 if it cannot be determined.
     */
    async function getVideoDuration(video) {
        if (video.duration && isFinite(video.duration) && video.duration > 0) {
            return Math.round(video.duration);
        }

        return new Promise((resolve) => {
            let resolved = false;

            const settle = (dur) => {
                if (resolved) return;
                resolved = true;
                video.removeEventListener('loadedmetadata', onReady);
                video.removeEventListener('durationchange', onReady);
                resolve(dur);
            };

            const onReady = () => {
                if (video.duration && isFinite(video.duration) && video.duration > 0) {
                    settle(Math.round(video.duration));
                }
            };

            video.addEventListener('loadedmetadata', onReady);
            video.addEventListener('durationchange', onReady);

            // Fallback timeout
            setTimeout(() => {
                const dur = video.duration;
                settle(dur && isFinite(dur) && dur > 0 ? Math.round(dur) : 0);
            }, 5000);
        });
    }

    // ==========================================
    // SEGMENT VALIDATION
    // ==========================================

    /**
     * Validates and sanitizes skip segments against the actual video duration.
     * Filters out segments with impossible times or unreasonable durations.
     */
    function validateSegments(segments, duration) {
        if (!segments || !duration || duration <= 0) return [];

        return segments.filter(seg => {
            const segEnd = seg.end !== null ? seg.end : duration;
            const segDuration = segEnd - seg.start;

            if (seg.start < 0 || seg.start >= duration) {
                warn(`Filtered segment (start ${seg.start}s out of bounds for ${duration}s video): ${seg.type}`);
                return false;
            }
            if (seg.end !== null && seg.end <= seg.start) {
                warn(`Filtered segment (end ${seg.end}s <= start ${seg.start}s): ${seg.type}`);
                return false;
            }
            if (segDuration < MIN_SEGMENT_DURATION) {
                warn(`Filtered segment (too short: ${segDuration.toFixed(1)}s): ${seg.type} ${seg.start}s-${segEnd.toFixed(1)}s`);
                return false;
            }
            const maxDur = MAX_SEGMENT_DURATION[seg.type] || 300;
            if (segDuration > maxDur) {
                warn(`Filtered segment (too long: ${segDuration.toFixed(1)}s > ${maxDur}s max): ${seg.type} ${seg.start}s-${segEnd.toFixed(1)}s`);
                return false;
            }

            return true;
        }).map(seg => ({
            ...seg,
            // Clamp end to video duration
            end: seg.end !== null ? Math.min(seg.end, duration) : null
        }));
    }

    // ==========================================
    // PARENT PAGE LOGIC (animepahe.*)
    // ==========================================
    async function runParent() {
        log('Parent script started');
        const pathParts = window.location.pathname.split('/');
        if (pathParts[1] !== 'play') return;

        const animeHash = pathParts[2];
        const episodeHash = pathParts[3];
        if (!animeHash || !episodeHash) {
            warn('Could not extract hashes from URL.');
            return;
        }

        // Wait for the details link to appear in DOM (it loads dynamically)
        const animeLink = await waitForElement('.theatre-info h1 a');
        if (!animeLink) {
            warn('Theatre details link not found in DOM.');
            return;
        }

        const detailsPath = animeLink.getAttribute('href');
        log(`Resolved details path: ${detailsPath}`);

        // Fetch external IDs from details page
        const ids = await getAnimeIds(animeHash, detailsPath);
        const episodeNum = await getEpisodeNumber();

        if (ids.malId || ids.anilistId) {
            // 1. Save to shared storage as fallback
            saveEpisodeInfo(episodeHash, {
                malId: ids.malId,
                anilistId: ids.anilistId,
                episodeNum: episodeNum,
                timestamp: Date.now()
            });

            // 2. Inject parameters directly into Kwik iframe URL
            updateIframeSrc(ids.malId, ids.anilistId, episodeNum);
        } else {
            error('Failed to resolve MAL or AniList ID.');
        }
    }

    async function getAnimeIds(animeHash, detailsPath) {
        const cachedMal = GM_getValue(`mal_id_${animeHash}`);
        const cachedAnilist = GM_getValue(`anilist_id_${animeHash}`);
        if (cachedMal || cachedAnilist) {
            log(`Using cached IDs â€” MAL: ${cachedMal}, AniList: ${cachedAnilist}`);
            return { malId: cachedMal, anilistId: cachedAnilist };
        }

        try {
            log(`Fetching IDs from details page: ${detailsPath}`);
            const response = await fetch(detailsPath);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            let anilistId = null;
            const anilistLink = doc.querySelector('a[href*="anilist.co/anime/"]');
            if (anilistLink) {
                const match = anilistLink.href.match(/\/anime\/(\d+)/);
                if (match) {
                    anilistId = match[1];
                    GM_setValue(`anilist_id_${animeHash}`, anilistId);
                }
            }

            let malId = null;
            const malLink = doc.querySelector('a[href*="myanimelist.net/anime/"]');
            if (malLink) {
                const match = malLink.href.match(/\/anime\/(\d+)/);
                if (match) {
                    malId = match[1];
                    GM_setValue(`mal_id_${animeHash}`, malId);
                }
            }

            log(`Resolved IDs â€” MAL: ${malId}, AniList: ${anilistId}`);
            return { malId, anilistId };
        } catch (e) {
            error('Error fetching details page IDs:', e);
        }
        return { malId: null, anilistId: null };
    }

    /**
     * Extracts the current episode number from the AnimePahe page.
     * Uses multiple fallback strategies since the page loads dynamically:
     *
     *   1. Active item in the episode dropdown menu (.dropup .active)
     *   2. Heading text in .theatre-info h1 (multiple regex patterns)
     *   3. document.title (multiple regex patterns)
     *   4. Any heading/element containing episode-like text
     */
    async function getEpisodeNumber() {
        // Multiple regex patterns from most specific to most generic.
        // AnimePahe headings can use different formats across versions:
        //   "Anime Name - Episode 5"
        //   "Anime Name - Ep 5"
        //   "Anime Name - 05"
        //   "Episode 5 - Anime Name"
        const episodePatterns = [
            /Episode\s+([\d.]+)/i,       // "Episode 5" or "Episode 12.5"
            /Ep\.?\s*([\d.]+)/i,         // "Ep 5", "Ep.5", "Ep. 12"
            /\be(\d{2,})\b/i,            // "E05", "e12" (common shorthand)
            /\s-\s+([\d.]+)\s*$/,        // "Anime Name - 05" (trailing number after dash)
        ];

        for (let i = 0; i < 80; i++) {  // Poll for up to 8 seconds

            // --- Strategy 1: Episode menu button (MOST RELIABLE) ---
            // AnimePahe has a .dropup.episode-menu with a button showing "Episode X"
            const epMenuBtn = document.querySelector('.dropup.episode-menu > button');
            if (epMenuBtn) {
                const btnText = epMenuBtn.textContent.trim();
                // Button text is usually "Episode 5" or just the number
                for (const pattern of episodePatterns) {
                    const match = btnText.match(pattern);
                    if (match) {
                        log(`Episode number from menu button: ${match[1]}`);
                        return parseFloat(match[1]);
                    }
                }
                // If no pattern matched, try extracting any number
                const numMatch = btnText.match(/(\d+(?:\.\d+)?)/);  
                if (numMatch) {
                    log(`Episode number from menu button (numeric): ${numMatch[1]}`);
                    return parseFloat(numMatch[1]);
                }
            }

            // --- Strategy 2: Active item in episode dropdown list ---
            const activeEp = document.querySelector('.dropup.episode-menu .dropdown-item.active, .episode-menu .active, .dropup .active');
            if (activeEp) {
                const epText = activeEp.textContent.trim();
                const directNum = parseFloat(epText);
                if (!isNaN(directNum) && directNum > 0) {
                    log(`Episode number from dropdown active item: ${directNum}`);
                    return directNum;
                }
                for (const pattern of episodePatterns) {
                    const match = epText.match(pattern);
                    if (match) {
                        log(`Episode number from dropdown active item (pattern): ${match[1]}`);
                        return parseFloat(match[1]);
                    }
                }
            }

            // --- Strategy 3: Theatre info heading ---
            const heading = document.querySelector('.theatre-info h1');
            if (heading) {
                const headingText = heading.textContent;
                for (const pattern of episodePatterns) {
                    const match = headingText.match(pattern);
                    if (match) {
                        log(`Episode number from heading: ${match[1]}`);
                        return parseFloat(match[1]);
                    }
                }

                // Extra fallback: look for any number in the heading after common separators
                // e.g., "Title - 05 (720p)" â†’ extract "05"
                const dashMatch = headingText.match(/[-â€“â€”]\s*(\d+(?:\.\d+)?)\s*(?:\(|$)/);
                if (dashMatch) {
                    log(`Episode number from heading (dash pattern): ${dashMatch[1]}`);
                    return parseFloat(dashMatch[1]);
                }
            }

            // --- Strategy 4: Document title ---
            for (const pattern of episodePatterns) {
                const match = document.title.match(pattern);
                if (match) {
                    log(`Episode number from document title: ${match[1]}`);
                    return parseFloat(match[1]);
                }
            }

            // --- Strategy 5: URL path ---
            // Some URL structures encode episode info
            const urlMatch = window.location.href.match(/[?&](?:ep|episode)=([\d.]+)/i);
            if (urlMatch) {
                log(`Episode number from URL parameter: ${urlMatch[1]}`);
                return parseFloat(urlMatch[1]);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // --- Last resort: broader search of the page ---
        // Look for any element that might contain episode info
        const allHeadings = document.querySelectorAll('h1, h2, h3, .theatre-info *');
        for (const el of allHeadings) {
            const text = el.textContent;
            for (const pattern of episodePatterns) {
                const match = text.match(pattern);
                if (match) {
                    log(`Episode number from broad search (${el.tagName}.${el.className}): ${match[1]}`);
                    return parseFloat(match[1]);
                }
            }
        }

        warn('Could not detect episode number from any source. Defaulting to 1.');
        return 1;
    }

    async function updateIframeSrc(malId, anilistId, episodeNum) {
        const iframe = await waitForElement('iframe[src*="kwik.cx/e/"], iframe[src*="kwik.cx/f/"]');
        if (!iframe) {
            warn('Kwik player iframe not found in DOM.');
            return;
        }

        const src = iframe.getAttribute('src');
        if (src && !src.includes('episode=')) {
            const url = new URL(src);
            if (malId) url.searchParams.set('malId', malId);
            if (anilistId) url.searchParams.set('anilistId', anilistId);
            url.searchParams.set('episode', episodeNum);
            iframe.setAttribute('src', url.toString());
            log(`Injected parameters into iframe src: ${url.toString()}`);
        }
    }

    function saveEpisodeInfo(episodeHash, info) {
        GM_setValue(`info_${episodeHash}`, info);
        let keys = GM_getValue('stored_info_keys', []);
        if (!keys.includes(episodeHash)) {
            keys.push(episodeHash);
        }
        // LRU cache: keep at most 50 episode entries
        while (keys.length > 50) {
            const oldKey = keys.shift();
            GM_setValue(`info_${oldKey}`, undefined);
        }
        GM_setValue('stored_info_keys', keys);
    }

    // ==========================================
    // IFRAME PLAYER LOGIC (kwik.cx)
    // ==========================================
    function runIframe() {
        log('Iframe script started');

        const urlParams = new URLSearchParams(window.location.search);
        const malId = urlParams.get('malId');
        const anilistId = urlParams.get('anilistId');
        const episodeNum = urlParams.get('episode');

        if ((malId || anilistId) && episodeNum) {
            log(`Metadata from URL params â€” MAL: ${malId}, AniList: ${anilistId}, Ep: ${episodeNum}`);
            setupSkip(malId, anilistId, parseFloat(episodeNum));
            return;
        }

        // Fallback: Try to extract episode number from the Kwik video filename.
        // The Kwik player has a .ss-label element with the filename in format:
        // "AnimePahe_AnimeName_-_01_720p_eng_sub.mp4"
        // This is a reliable fallback even if URL params weren't injected.
        tryFallbackFromFilename();

        // Also try GM storage fallback
        const episodeHash = window.location.pathname.split('/').filter(Boolean).pop();
        if (!episodeHash) return;

        log(`URL params not found. Falling back to GM Storage for hash: ${episodeHash}`);
        let attempts = 0;
        const checkInterval = setInterval(() => {
            const info = GM_getValue(`info_${episodeHash}`);
            if (info) {
                clearInterval(checkInterval);
                log(`Metadata from GM Storage â€” MAL: ${info.malId}, AniList: ${info.anilistId}, Ep: ${info.episodeNum}`);
                setupSkip(info.malId, info.anilistId, info.episodeNum);
            } else {
                attempts++;
                if (attempts > 150) { // Wait up to 15 seconds
                    clearInterval(checkInterval);
                    warn('Timed out waiting for episode info from parent frame.');
                }
            }
        }, 100);
    }

    /**
     * Fallback: Extract episode number from the Kwik player's video filename.
     * The .ss-label element contains the filename like:
     * "AnimePahe_AnimeName_-_01_720p_eng_sub.mp4"
     */
    function tryFallbackFromFilename() {
        const label = document.querySelector('.ss-label');
        if (label) {
            const fileName = label.textContent;
            const match = fileName.match(/^AnimePahe_.+_-_([\d.]{2,})/);
            if (match) {
                log(`Episode number from video filename: ${match[1]}`);
                return parseFloat(match[1]);
            }
        }
        return null;
    }

    function setupSkip(malId, anilistId, episodeNum) {
        const video = document.querySelector('video');
        if (!video) {
            const observer = new MutationObserver((_, obs) => {
                const vid = document.querySelector('video');
                if (vid) {
                    obs.disconnect();
                    initVideoControls(vid, malId, anilistId, episodeNum);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        } else {
            initVideoControls(video, malId, anilistId, episodeNum);
        }
    }

    async function initVideoControls(video, malId, anilistId, episodeNum) {
        // Use robust duration detection
        const duration = await getVideoDuration(video);

        // Per API docs: episodeLength=0 returns all results regardless of duration.
        // So we can still proceed even if duration detection fails.
        if (duration <= 0) {
            warn('Could not determine video duration. Will use episodeLength=0 (returns all matches).');
        } else {
            log(`Video duration: ${duration}s`);
        }

        // Fetch from both APIs in parallel and merge
        const segments = await fetchAllSkipTimes(malId, anilistId, episodeNum, duration);

        if (!segments || segments.length === 0) {
            log('No valid skip segments found from any source.');
            return;
        }

        startSkipUI(video, segments);
    }

    // ==========================================
    // API ORCHESTRATION â€” PARALLEL FETCH & MERGE
    // ==========================================

    /**
     * Fetches skip times from both APIs in parallel, validates, and merges.
     * AniSkip (MAL) is preferred; Anime Skip (AniList) supplements missing types.
     */
    async function fetchAllSkipTimes(malId, anilistId, episodeNum, duration) {
        let resolvedMalId = malId;
        let resolvedEpisodeNum = episodeNum;

        // Check relation rules for episode number remapping.
        // Some anime on AnimePahe use absolute episode numbers (e.g., Episode 25)
        // but MAL has separate entries per season (e.g., Season 2 Episode 1).
        // The relation-rules API provides the correct MAL ID and episode offset.
        if (malId) {
            try {
                const remap = await fetchRelationRules(malId, episodeNum);
                if (remap) {
                    log(`Relation rule applied: MAL ${malId} Ep ${episodeNum} â†’ MAL ${remap.malId} Ep ${remap.episodeNum}`);
                    resolvedMalId = remap.malId;
                    resolvedEpisodeNum = remap.episodeNum;
                }
            } catch (e) {
                warn('Relation rules lookup failed, using original IDs:', e);
            }
        }

        const results = { aniSkip: null, animeSkip: null };
        const promises = [];

        if (resolvedMalId) {
            promises.push(
                fetchAniSkipTimes(resolvedMalId, resolvedEpisodeNum, duration)
                    .then(r => { results.aniSkip = r; })
                    .catch(e => { error('AniSkip fetch failed:', e); })
            );
        }

        if (anilistId) {
            promises.push(
                fetchAnimeSkipTimes(anilistId, episodeNum)
                    .then(r => { results.animeSkip = r; })
                    .catch(e => { error('Anime Skip fetch failed:', e); })
            );
        }

        if (promises.length === 0) {
            warn('No MAL ID or AniList ID available.');
            return null;
        }

        await Promise.all(promises);

        // Validate both sets against the actual video duration
        // Use duration > 0 for validation; if duration is 0, skip validation (accept all)
        const validAniSkip = duration > 0 ? validateSegments(results.aniSkip, duration) : (results.aniSkip || []);
        const validAnimeSkip = duration > 0 ? validateSegments(results.animeSkip, duration) : (results.animeSkip || []);

        log(`AniSkip (MAL): ${validAniSkip.length} valid | Anime Skip (AniList): ${validAnimeSkip.length} valid`);

        // Merge: prefer AniSkip segments, supplement with Anime Skip for missing types.
        // Normalize mixed-op/mixed-ed to op/ed for type deduplication.
        const merged = [];
        const coveredBaseTypes = new Set();

        const getBaseType = (type) => {
            if (type === 'mixed-op') return 'op';
            if (type === 'mixed-ed') return 'ed';
            return type;
        };

        for (const seg of validAniSkip) {
            merged.push({ ...seg, source: 'aniskip' });
            coveredBaseTypes.add(getBaseType(seg.type));
        }

        for (const seg of validAnimeSkip) {
            if (!coveredBaseTypes.has(getBaseType(seg.type))) {
                merged.push({ ...seg, source: 'animeskip' });
                coveredBaseTypes.add(getBaseType(seg.type));
            }
        }

        if (merged.length > 0) {
            log('Final segments:', merged.map(s =>
                `${s.type} ${s.start.toFixed(1)}sâ€“${s.end !== null ? s.end.toFixed(1) + 's' : 'end'} (${s.source})`
            ).join(', '));
        }

        return merged.length > 0 ? merged : null;
    }

    // ==========================================
    // API ENGINES
    // ==========================================

    /**
     * Anime Skip API (AniList-based).
     * Timestamps are section markers â€” each one marks where a section begins.
     * End of a section = start of the next timestamp.
     */
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

            // FIX: Search across ALL matching shows for the episode, not just shows[0].
            let episode = null;
            for (const show of shows) {
                if (!show.episodes) continue;
                const found = show.episodes.find(ep => {
                    const epNum = parseFloat(ep.number);
                    return !isNaN(epNum) && epNum === episodeNum;
                });
                if (found && found.timestamps && found.timestamps.length > 0) {
                    episode = found;
                    break;
                }
            }

            if (!episode || !episode.timestamps || episode.timestamps.length === 0) return null;

            const sorted = [...episode.timestamps].sort((a, b) => a.at - b.at);
            const segments = [];
            const skipTypes = ['Intro', 'New Intro', 'Credits', 'New Credits', 'Mixed Credits', 'Recap'];

            for (let i = 0; i < sorted.length; i++) {
                const current = sorted[i];
                if (!skipTypes.includes(current.type.name)) continue;

                const next = sorted[i + 1];
                const start = current.at;
                const end = next ? next.at : null;

                let generalType = 'op';
                if (current.type.name.includes('Credits')) generalType = 'ed';
                else if (current.type.name.includes('Recap')) generalType = 'recap';

                segments.push({ type: generalType, start, end });
            }

            log(`Anime Skip: ${segments.length} raw segments for AniList ${anilistId} Ep ${episodeNum}`);
            return segments;
        } catch (e) {
            error('Anime Skip API error:', e);
        }
        return null;
    }

    /**
     * AniSkip API (MAL-based).
     * Returns explicit start/end intervals. The episodeLength parameter is used
     * to match against the correct set of stored timestamps for this video version.
     * Per the API docs, episodeLength=0 returns ALL matches regardless of duration.
     * Supported skip types: op, ed, mixed-op, mixed-ed, recap.
     */
    async function fetchAniSkipTimes(malId, episodeNum, duration) {
        // Request all 5 supported skip types
        const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNum}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=${duration}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            if (data.found && data.results) {
                const segments = data.results.map(item => ({
                    type: item.skipType,
                    start: item.interval.startTime,
                    end: item.interval.endTime
                }));
                log(`AniSkip: ${segments.length} raw segments for MAL ${malId} Ep ${episodeNum}`);
                return segments;
            }
        } catch (e) {
            error('AniSkip API error:', e);
        }
        return null;
    }

    /**
     * Fetches relation rules from the AniSkip API.
     * These rules remap episode numbers when AnimePahe uses absolute numbering
     * but MAL has separate entries per season.
     *
     * Example: MAL ID 1234, Episode 25 → rules say episodes 13+ map to MAL ID 5678, starting at 1.
     * So Episode 25 → MAL 5678, Episode 13.
     */
    async function fetchRelationRules(malId, episodeNum) {
        const url = `https://api.aniskip.com/v2/relation-rules/${malId}`;
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();

            if (!data.found || !data.rules || data.rules.length === 0) return null;

            // Find a rule that covers our episode number
            for (const rule of data.rules) {
                const fromStart = rule.from.start;
                const fromEnd = rule.from.end || Infinity;

                if (episodeNum >= fromStart && episodeNum <= fromEnd) {
                    const offset = episodeNum - fromStart;
                    const newEpisodeNum = rule.to.start + offset;
                    return {
                        malId: rule.to.malId.toString(),
                        episodeNum: newEpisodeNum
                    };
                }
            }
        } catch (e) {
            warn('Relation rules API error:', e);
        }
        return null;
    }

    function getSegmentName(type) {
        switch (type) {
            case 'op': return 'Opening';
            case 'mixed-op': return 'Opening';
            case 'ed': return 'Ending';
            case 'mixed-ed': return 'Ending';
            case 'recap': return 'Recap';
            default: return 'Segment';
        }
    }

    // ==========================================
    // SKIP UI CONTROLLER
    // ==========================================
    async function startSkipUI(video, segments) {
        log('Initializing skip UI with', segments.length, 'segments');

        injectStyles();
        const ui = createUI(video);

        let currentSegment = null;
        let lastTime = 0;
        let disableAutoSkipForCurrent = false;

        function skipToEnd(segment) {
            video.currentTime = segment.end !== null ? segment.end : video.duration;
            video.play().catch(() => {});
        }

        // Auto-skip toggle handler
        ui.autoToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const newVal = !ui.isAutoSkip();
            ui.setAutoSkip(newVal);
            GM_setValue('auto_skip_enabled', newVal);
            ui.autoToggle.classList.toggle('active', newVal);

            if (newVal && currentSegment && !disableAutoSkipForCurrent) {
                skipToEnd(currentSegment);
                showNotification(`Auto-Skipped ${getSegmentName(currentSegment.type)}`);
                hideBtn();
            }
        });

        /**
         * Core time-check function. Called on timeupdate and seek events.
         */
        function checkTime() {
            const currentTime = video.currentTime;
            const isSeeking = Math.abs(currentTime - lastTime) > 1.5;
            lastTime = currentTime;

            // FIX: Reduced boundary buffer from 1s to 0.5s
            const activeSegment = segments.find(seg =>
                currentTime >= seg.start && (seg.end === null || currentTime < seg.end - 0.5)
            );

            if (activeSegment) {
                if (isSeeking) {
                    disableAutoSkipForCurrent = true;
                    showBtn(activeSegment);
                }

                if (currentSegment !== activeSegment) {
                    currentSegment = activeSegment;

                    if (ui.isAutoSkip() && !disableAutoSkipForCurrent) {
                        skipToEnd(activeSegment);
                        showNotification(`Auto-Skipped ${getSegmentName(activeSegment.type)}`);
                        hideBtn();
                    } else {
                        showBtn(activeSegment);
                    }
                }
            } else if (currentSegment) {
                currentSegment = null;
                disableAutoSkipForCurrent = false;
                hideBtn();
            }
        }

        // Use both timeupdate and a polling interval for reliability.
        // timeupdate fires at ~250ms intervals (browser-dependent),
        // the polling interval fills gaps for more responsive detection.
        let checkInterval = null;
        function startLoop() {
            if (!checkInterval) checkInterval = setInterval(checkTime, 100);
        }
        function stopLoop() {
            if (checkInterval) { clearInterval(checkInterval); checkInterval = null; }
        }

        video.addEventListener('play', startLoop);
        video.addEventListener('pause', stopLoop);
        video.addEventListener('seeking', checkTime);
        video.addEventListener('seeked', checkTime);

        if (!video.paused) startLoop();
        checkTime();

        function showBtn(segment) {
            ui.mainBtn.querySelector('span').textContent = `Skip ${getSegmentName(segment.type)}`;
            ui.container.classList.add('visible');
            ui.mainBtn.onclick = (e) => {
                e.stopPropagation();
                skipToEnd(segment);
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

            clearTimeout(ui.notification._timeout);
            ui.notification._timeout = setTimeout(() => {
                ui.notification.classList.remove('visible');
            }, 3000);
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


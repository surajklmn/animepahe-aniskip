# AnimePahe OP/ED Skip (Dual-Engine)

[![Greasy Fork](https://img.shields.io/badge/Greasy%20Fork-v3.2-red?style=flat-square&logo=greasemonkey)](https://greasyfork.org/en/scripts/584067-animepahe-op-ed-skip-dual-engine)
I couldn't find a reliable AniSkip implementation for AnimePahe without installing external extensions, though universal support was scoped down due to iframe security blocks on other sites. Give it a shot if you want to.

## Greasy Fork Installation
Install the script directly from Greasy Fork:
👉 [AnimePahe OP/ED Skip (Dual-Engine) on Greasy Fork](https://greasyfork.org/en/scripts/584067-animepahe-op-ed-skip-dual-engine)

---

## Enabling Support for All Sites (Universal / Miruro)

To enable the script on other streaming sites (like Miruro or generic player hosts):

1. Open your userscript manager (e.g., Violentmonkey or Tampermonkey).
2. Edit this script.
3. Locate the metadata headers and uncomment the universal matcher:
   ```javascript
   // To enable Universal or other sites (like Miruro), change the match to @match:
   // @match        *://*/*
   ```
4. Scroll down to the fast-exit blocks and uncomment the universal checks for parent frames:
   ```javascript
   // To enable Miruro or Universal matching, uncomment the line below:
   const isSupportedParent = href.includes('animepahe.') || href.includes('miruro.') || isWatchPage();
   ```
5. Do the same for iframe checks:
   ```javascript
   // To enable any iframe player (e.g. for Miruro or Universal), uncomment the line below:
   const isSupportedIframe = isIframe;
   ```
6. Save the script!

---

## Credits
- **APIs Used:**
  - [AniSkip API](https://api.aniskip.com/)
  - [Anime Skip GraphQL API](https://api.anime-skip.com/)


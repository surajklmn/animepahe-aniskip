I couldn't find a reliable AniSkip implementation for AnimePahe without installing external extensions, though universal support was scoped down due to iframe security blocks on other sites.
Give it a shot if you want to.


To enable it in all of the sites::

1. Open your userscript manager (e.g., Violentmonkey).
2. Edit this script.
3. Locate the metadata headers and uncomment the universal matcher:

```javascript
// To enable Universal or other sites (like Miruro), uncomment the match below:
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

### Credits
APIs Used: AniSkip API & Anime Skip GraphQL API


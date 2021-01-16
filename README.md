# node-chromedriver-downloader
Automatically checks Chrome version and downloads the appropriate chromedriver on runtime.

### installation
`npm install node-chromedriver-downloader`

### usage
```typescript
import {ensureChromedriver} from 'node-chromedriver-downloader'

(async () => {
  var chromedriverBinaryPath = await ensureChromedriver()
})()
```
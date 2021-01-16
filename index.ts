import findChromeVersion from 'find-chrome-version'
import extract from 'extract-zip'
import fetch from 'node-fetch'
import os from 'os'
import {writeFile, unlink, existsSync, mkdir, readdir, ensureDir} from 'fs-extra'
import path from 'path'

const osPlatform = os.platform()
const binaryExtension = osPlatform == 'win32' ? '.exe' : ''

const getMajorVersion = (fullVersion : string) : string => {
    var numbers = fullVersion.split('.')
    if (numbers.length < 2) throw new Error(`Error getting major number from chrome version '${fullVersion}'`)
    return fullVersion.split('.')[0]
}

const getLatestRelease = async (majorVersion : string) : Promise<string> => {
    const LATEST_RELEASE_INFO_URL = `https://chromedriver.storage.googleapis.com/LATEST_RELEASE_${majorVersion}`

    var res = await fetch(LATEST_RELEASE_INFO_URL)
    if (!res.ok) throw new Error(`Error requesting chrome driver latest version. Status: ${res.statusText}`)

    var text = await res.text()
    if (!text.match(/^\d+\.\d.\d+\.\d+$/)) throw new Error(`Requested latest chrome driver version is not of appropriate format: '${text}' doesn't match XX.X.XXXX.XX`)
    return text
}

const downloadChromedriver = async (fullVersion : string, destinationDir : string, onProgress = console.log) : Promise<string> => {
    if (!['win32', 'darwin', 'linux'].includes(osPlatform)) throw new Error("Unsupported OS platform for chromedriver: " + osPlatform)

    // not all chrome versions have a driver. Therefore find the latest one for the current major
    var currentMajor = getMajorVersion(fullVersion)
    var latestRelease = await getLatestRelease(currentMajor)

    const RELASE_DOWNLOAD_URL = `https://chromedriver.storage.googleapis.com/${latestRelease}/chromedriver_${osPlatform}.zip`

    const zipDestPath = path.join(destinationDir, `chromedriver_${osPlatform}_${latestRelease}.zip`)
    const infoDestPath = path.join(destinationDir, `CHROMEDRIVER_VER_IS_${currentMajor}`)

    onProgress(`Downloading from ${RELASE_DOWNLOAD_URL}..`)

    await fetch(RELASE_DOWNLOAD_URL)
        .then(x => x.arrayBuffer())
        .then(x => writeFile(zipDestPath, Buffer.from(x)))

    // extract the binary file
    onProgress(`Extracting zip to ${zipDestPath}..`)
    await extract(zipDestPath, { dir: destinationDir })
    
    // Ensure that the binary exists now
    const binaryDestPath = path.join(destinationDir, `chromedriver${binaryExtension}`)
    if (!existsSync(binaryDestPath)) throw new Error("Something went wrong when unzipping chromedriver. Binary is not persent at " + binaryDestPath)

    // remove the zip file
    await unlink(zipDestPath)

    // Remove previous version info files 
    for (let file of (await readdir(destinationDir))) {
        if (file.match(/^CHROMEDRIVER_VER_IS_\d+$/)) {
            onProgress(`Removing previous version info file ${file}..`)
            await unlink(path.join(destinationDir, file))
        }
    }

    // Write a version info file. Don't rename the actual chromedriver binary, because some apps might need that to be unchagned
    onProgress(`Writing version info file to ${infoDestPath}..`)
    await writeFile(infoDestPath, '')

    onProgress('chromedriver binaries succesfully downloaded')
    return binaryDestPath
}

// Chrome version shall be only requested once per runtime, because it's unlikely to change during runtime, and checking it everytime is slow
var savedChromeVersion = undefined

/**
   * Ensure that chromedriver is in the given directory.
   * First run launches a headless chrome to check version, which is saved in memory. If chromedriver already exists, call 3x existsSyncs.
   *
   * @param locationDir - (optional) Chromedriver directory path (will be created if doesn't exist).
   *                      default = path.join(os.tmpdir(), 'node-chromedriver-downloader')
   * @param onProgress - (optional) Call this function on progress. Note: errors will be thrown instead of called here.
   *                     default = console.log
   * 
   * @returns Chromedriver binary path (for example on windows ending in chromedriver.exe).
   *
   */
const ensureChromedriver = async (locationDir : string = undefined, onProgress : (...data : any[]) => void = console.log) : Promise<string> => {
    if (locationDir === undefined) {
        locationDir = path.join(os.tmpdir(), 'node-chromedriver-downloader')
    }

    if (!existsSync(locationDir)) {
        onProgress(`Making directory ${locationDir} for chromedriver`)
        await mkdir(locationDir)
    }

    savedChromeVersion = savedChromeVersion ? savedChromeVersion : (await findChromeVersion())
    var currentChromeMajorVersion = getMajorVersion(savedChromeVersion)
    
    var chromedriverPath = path.join(locationDir, `chromedriver${binaryExtension}`)
    var chromedriverVersionPath = path.join(locationDir, `CHROMEDRIVER_VER_IS_${currentChromeMajorVersion}`)

    if (existsSync(chromedriverPath) && existsSync(chromedriverVersionPath)) {
        return chromedriverPath
    }

    onProgress(`chromedriver${binaryExtension} or CHROMEDRIVER_VER_IS_${currentChromeMajorVersion} is missing at ${locationDir}`)

    await downloadChromedriver(savedChromeVersion, locationDir, onProgress)

    return chromedriverPath
}

export {
    ensureChromedriver,
    downloadChromedriver
}
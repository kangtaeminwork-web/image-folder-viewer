const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const LIBRARY_PATH = 'C:\\Users\\rkdvo\\Downloads\\hitomi_downloader_GUI\\library'

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  })
  win.loadFile('index.html')

  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11') {
      const isFullScreen = win.isFullScreen()
      win.setFullScreen(!isFullScreen)
    }
    if (input.key === 'Escape' && win.isFullScreen()) {
      win.setFullScreen(false)
    }
  })

  win.on('enter-full-screen', () => {
    win.webContents.send('fullscreen-change', true)
  })
  win.on('leave-full-screen', () => {
    win.webContents.send('fullscreen-change', false)
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('read-folder', async (event, folderPath) => {
  if (!fs.existsSync(folderPath)) {
    return { type: 'notfound' }
  }

  const items = fs.readdirSync(folderPath)

  // 영상 폴더 감지 (videos 폴더 또는 그 하위)
  const isVideosFolder = folderPath.includes('videos')

  if (isVideosFolder) {
    // 직접 영상 파일 목록
    const videoFiles = items
      .filter(f => /\.(mp4|webm|mkv|avi|mov)$/i.test(f))
      .sort()

    // 시리즈 폴더 목록
    const seriesFolders = items
      .filter(name => fs.statSync(path.join(folderPath, name)).isDirectory())
      .sort((a, b) => {
        const aTime = fs.statSync(path.join(folderPath, a)).birthtimeMs
        const bTime = fs.statSync(path.join(folderPath, b)).birthtimeMs
        return bTime - aTime
      })

    // 시리즈 폴더 안에 영상 파일들이 있으면 에피소드 목록 반환
    if (videoFiles.length === 0 && seriesFolders.length === 0) {
      return { type: 'folder', doujinList: [] }
    }

    // 현재 폴더가 시리즈 폴더인 경우 (영상 파일이 직접 있음)
    if (videoFiles.length > 0) {
      return {
        type: 'video-viewer',
        videos: videoFiles.map(f => path.join(folderPath, f)),
        title: path.basename(folderPath)
      }
    }

    // videos 루트 폴더인 경우 — 단편 영상 + 시리즈 폴더 목록 반환
    const doujinList = seriesFolders.map(folderName => {
      const subFolderPath = path.join(folderPath, folderName)
      const subItems = fs.readdirSync(subFolderPath)
      const subVideos = subItems.filter(f => /\.(mp4|webm|mkv|avi|mov)$/i.test(f))
      return {
        name: folderName,
        folderPath: subFolderPath,
        thumbnail: null,
        count: subVideos.length,
        isVideo: true
      }
    })

    return { type: 'folder', doujinList: doujinList }
  }

  // 기존 이미지 로직
  const subFolders = items
    .filter(name => {
      const fullPath = path.join(folderPath, name)
      return fs.statSync(fullPath).isDirectory()
    })
    .sort((a, b) => {
      const aTime = fs.statSync(path.join(folderPath, a)).birthtimeMs
      const bTime = fs.statSync(path.join(folderPath, b)).birthtimeMs
      return bTime - aTime
    })

  const images = items
    .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    .sort()

  if (images.length > 0) {
    return {
      type: 'viewer',
      images: images.map(f => path.join(folderPath, f))
    }
  }

  const doujinList = subFolders.map(folderName => {
    const subFolderPath = path.join(folderPath, folderName)
    const subItems = fs.readdirSync(subFolderPath)

    const subImages = subItems
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .sort()

    const subSubFolders = subItems
      .filter(name => fs.statSync(path.join(subFolderPath, name)).isDirectory())

    let thumbnail = null
    if (subImages.length > 0) {
      thumbnail = path.join(subFolderPath, subImages[0])
    } else if (subSubFolders.length > 0) {
      const firstSubFolder = path.join(subFolderPath, subSubFolders[0])
      const firstSubImages = fs.readdirSync(firstSubFolder)
        .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
        .sort()
      if (firstSubImages.length > 0) {
        thumbnail = path.join(firstSubFolder, firstSubImages[0])
      }
    }

    return {
      name: folderName,
      folderPath: subFolderPath,
      thumbnail: thumbnail,
      count: subImages.length
    }
  })

  return { type: 'folder', doujinList: doujinList }
})

ipcMain.handle('delete-folder', async (event, folderPath) => {
  await shell.trashItem(folderPath)
  return true
})

ipcMain.handle('move-folder', async (event, folderPath) => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '이동할 폴더를 선택하세요'
  })
  if (result.canceled) return null

  const targetDir = result.filePaths[0]
  const folderName = path.basename(folderPath)
  const targetPath = path.join(targetDir, folderName)

  fs.renameSync(folderPath, targetPath)
  return true
})

const settingsPath = path.join(app.getPath('userData'), 'settings.json')
const tagsPath = path.join(app.getPath('userData'), 'tags.json')
const viewCountPath = path.join(app.getPath('userData'), 'viewcount.json')

ipcMain.handle('save-settings', (event, settings) => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings))
  return true
})

ipcMain.handle('load-settings', () => {
  try {
    const data = fs.readFileSync(settingsPath, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return {}
  }
})

ipcMain.handle('save-tags', (event, tags) => {
  fs.writeFileSync(tagsPath, JSON.stringify(tags))
  return true
})

ipcMain.handle('load-tags', () => {
  try {
    const data = fs.readFileSync(tagsPath, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return {}
  }
})

ipcMain.handle('load-viewcount', () => {
  try {
    const data = fs.readFileSync(viewCountPath, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return {}
  }
})

ipcMain.handle('increase-viewcount', async (event, folderPath) => {
  let viewCount = {}
  try {
    const data = fs.readFileSync(viewCountPath, 'utf-8')
    viewCount = JSON.parse(data)
  } catch (e) {}

  const folderName = path.basename(folderPath)
  viewCount[folderName] = (viewCount[folderName] || 0) + 1
  const count = viewCount[folderName]

  fs.writeFileSync(viewCountPath, JSON.stringify(viewCount))

  let targetGrade = null
  if (count >= 10) targetGrade = 'A'
  else if (count >= 5) targetGrade = 'B'
  else if (count >= 1) targetGrade = 'C'

  if (!targetGrade) return { count, moved: false }

  const parentFolder = path.basename(path.dirname(folderPath))
  if (parentFolder === targetGrade) return { count, moved: false }

  const targetDir = path.join(LIBRARY_PATH, targetGrade)
  const targetPath = path.join(targetDir, folderName)

  try {
    fs.renameSync(folderPath, targetPath)
    return { count, moved: true, newPath: targetPath }
  } catch (e) {
    return { count, moved: false }
  }
})

ipcMain.handle('get-library-path', () => {
  return LIBRARY_PATH
})

// 전체화면 해제
ipcMain.handle('exit-fullscreen', () => {
  const win = BrowserWindow.getFocusedWindow()
  if (win) win.setFullScreen(false)
})

// 마지막으로 본 날짜 저장 파일 경로
const lastViewedPath = path.join(app.getPath('userData'), 'lastviewed.json')

// 마지막으로 본 날짜 저장
ipcMain.handle('save-lastviewed', (event, data) => {
  fs.writeFileSync(lastViewedPath, JSON.stringify(data))
  return true
})

// 마지막으로 본 날짜 불러오기
ipcMain.handle('load-lastviewed', () => {
  try {
    const data = fs.readFileSync(lastViewedPath, 'utf-8')
    return JSON.parse(data)
  } catch (e) {
    return {}
  }
})

ipcMain.handle('set-fullscreen', (event, value) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) win.setFullScreen(value)
})

ipcMain.handle('refocus-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.blur()
    win.focus()
    win.webContents.focus()
  }
})

ipcMain.handle('quit-app', () => {
  app.quit()
})
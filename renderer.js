const { ipcRenderer } = require('electron')

let images = []
let currentPage = 0
let rightClickedPath = null
let currentSize = 'small'
let tags = {}
let currentModalTags = []
let folderStack = []
let currentDoujinList = []
let currentSort = 'date'
let viewCount = {}
let sortOrder = 'desc'
let lastViewed = {}
let globalTagList = []
let isFullscreen = false
let currentVideos = []
let currentVideoIndex = 0


function showLibrary() {
  document.getElementById('toolbar').style.pointerEvents = 'auto'
  const preview = document.getElementById('page-preview')
  preview.style.opacity = '0'
  preview.style.pointerEvents = 'none'
  document.getElementById('library-screen').className = 'screen active'
  document.getElementById('viewer-screen').className = 'screen'
  document.getElementById('video-viewer-screen').className = 'screen'
  document.querySelectorAll('.library-only').forEach(el => {
    if (el.tagName === 'INPUT') {
      el.style.display = 'inline-block'
    } else if (el.tagName === 'DIV') {
      el.style.display = 'inline-flex'
    } else {
      el.style.display = 'inline-flex'
    }
  })
  document.querySelectorAll('.viewer-only').forEach(el => el.style.display = 'none')
  document.getElementById('btn-fullscreen').style.display = 'inline-flex'
  document.getElementById('tag-search').style.display = 'inline-block'  // inline-flex → inline-block

  const toolbar = document.getElementById('toolbar')
  toolbar.style.opacity = '1'
  toolbar.style.pointerEvents = 'auto'
  toolbar.style.transition = 'none'  // transition 완전히 끊기
  hudPinned = false
  document.removeEventListener('mousemove', handleMouseMove)

  // 안전장치: 혹시 남아있을 pointerEvents 강제 초기화
  setTimeout(() => {
    toolbar.style.pointerEvents = 'auto'
    document.getElementById('tag-search').style.pointerEvents = 'auto'
    ipcRenderer.invoke('refocus-window')
  }, 300)
}

function showVideoViewer(videos, index) {
  document.getElementById('library-screen').className = 'screen'
  document.getElementById('viewer-screen').className = 'screen'
  document.getElementById('video-viewer-screen').className = 'screen active'

  const episodeList = document.getElementById('episode-list')
  if (videos.length <= 1) {
    episodeList.style.display = 'none'
  } else {
    episodeList.style.display = 'flex'
    episodeList.innerHTML = ''
    videos.forEach((videoPath, i) => {
      const item = document.createElement('div')
      item.className = 'episode-item' + (i === index ? ' active' : '')
      item.textContent = videoPath.split('\\').pop()
      item.addEventListener('click', () => playVideo(i))
      episodeList.appendChild(item)
    })
  }
  playVideo(index)
}

function playVideo(index) {
  currentVideoIndex = index
  const video = document.getElementById('main-video')
  video.src = currentVideos[index]
  video.play()

  document.querySelectorAll('.episode-item').forEach((item, i) => {
    item.className = 'episode-item' + (i === index ? ' active' : '')
  })

  const seekbar = document.getElementById('video-seekbar')
  seekbar.value = 0

  video.addEventListener('timeupdate', () => {
    if (video.duration) {
      seekbar.value = (video.currentTime / video.duration) * 100
      document.getElementById('video-time').textContent =
        `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
    }
  }, { once: false })

  video.addEventListener('ended', () => {
    if (currentVideoIndex < currentVideos.length - 1) {
      playVideo(currentVideoIndex + 1)
    }
  })
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

document.getElementById('btn-video-back').addEventListener('click', () => {
  const video = document.getElementById('main-video')
  video.pause()
  video.src = ''
  if (folderStack.length > 0) {
    const currentFolder = folderStack[folderStack.length - 1]
    ipcRenderer.invoke('read-folder', currentFolder).then(result => {
      if (result.type === 'folder') {
        currentDoujinList = result.doujinList
        showLibrary()
        renderThumbnails()
      }
    })
  } else {
    showLibrary()
  }
})

document.getElementById('btn-video-play').addEventListener('click', () => {
  const video = document.getElementById('main-video')
  if (video.paused) {
    video.play()
    document.getElementById('btn-video-play').textContent = '⏸'
  } else {
    video.pause()
    document.getElementById('btn-video-play').textContent = '▶'
  }
})

document.getElementById('video-seekbar').addEventListener('input', (e) => {
  const video = document.getElementById('main-video')
  if (video.duration) {
    video.currentTime = (e.target.value / 100) * video.duration
  }
})

document.getElementById('video-volume').addEventListener('input', (e) => {
  document.getElementById('main-video').volume = e.target.value
})

document.getElementById('btn-video-fullscreen').addEventListener('click', () => {
  ipcRenderer.invoke('set-fullscreen', !isFullscreen)
})

document.getElementById('btn-close-video').addEventListener('click', () => {
  ipcRenderer.invoke('quit-app')
})

function showViewer() {
  document.getElementById('library-screen').className = 'screen'
  document.getElementById('viewer-screen').className = 'screen active'
  document.querySelectorAll('.library-only').forEach(el => el.style.display = 'none')
  document.querySelectorAll('.viewer-only').forEach(el => el.style.display = 'inline-flex')
  document.getElementById('tag-search').style.display = 'none'

  // 뷰어에선 툴바+미리보기 바 숨기고 마우스 이벤트로 제어
  const toolbar = document.getElementById('toolbar')
  const preview = document.getElementById('page-preview')
  toolbar.style.opacity = '0'
  toolbar.style.transition = 'opacity 0.3s'
  toolbar.style.pointerEvents = 'none'
  preview.style.opacity = '0'
  preview.style.transition = 'opacity 0.3s'
  preview.style.pointerEvents = 'none'
  hudPinned = false
  document.addEventListener('mousemove', handleMouseMove)
}

async function openFolder(folderPath, addToStack = true) {
  const result = await ipcRenderer.invoke('read-folder', folderPath)

  if (result.type === 'notfound') {
    if (folderStack.length > 0) {
      const currentFolder = folderStack[folderStack.length - 1]
      const refreshResult = await ipcRenderer.invoke('read-folder', currentFolder)
      if (refreshResult.type === 'folder') {
        currentDoujinList = refreshResult.doujinList
        renderThumbnails()
      }
    }
    return
  }

  if (result.type === 'viewer') {
    images = result.images
    currentPage = 0
    const folderName = folderPath.split('\\').pop()
    document.getElementById('current-title').textContent = folderName

    // 뷰어 화면 전환 먼저
    showViewer()
    renderPagePreview()
    showPage(0)

    // 전체화면 자동 진입
    ipcRenderer.invoke('set-fullscreen', true)

    lastViewed[folderName] = new Date().toISOString()
    await ipcRenderer.invoke('save-lastviewed', lastViewed)

    const vcResult = await ipcRenderer.invoke('increase-viewcount', folderPath)
    if (vcResult) {
      viewCount[folderName] = vcResult.count
    }

  } else if (result.type === 'video-viewer') {
    currentVideos = result.videos
    currentVideoIndex = 0
    showVideoViewer(result.videos, 0)
    ipcRenderer.invoke('set-fullscreen', true) 
  }else {
    if (addToStack) folderStack.push(folderPath)
    currentDoujinList = result.doujinList
    document.getElementById('empty-msg').style.display = 'none'
    updateBackButton()
    renderThumbnails()
    showLibrary()
  }
}

function getGradeName(count) {
  if (count >= 10) return 'A'
  if (count >= 5) return 'B'
  return 'C'
}

function updateBackButton() {
  const btn = document.getElementById('btn-library-back')
  btn.style.display = folderStack.length > 1 ? 'inline-flex' : 'none'
}

function renderThumbnails(filter = '') {
  const grid = document.getElementById('thumbnail-grid')
  grid.innerHTML = ''

  const recommendedNames = getRecommendedNames()

  let filtered = filter
    ? currentDoujinList.filter(d => {
        const doujinTags = tags[d.name] || []
        const filterTags = filter.split(',').map(f => f.trim()).filter(f => f.length > 0)
        return filterTags.every(f => doujinTags.some(tag => tag.toLowerCase().includes(f.toLowerCase()))) &&
          !recommendedNames.includes(d.name)
      })
    : currentDoujinList.filter(d => !recommendedNames.includes(d.name))

  if (currentSort === 'date') {
    if (sortOrder === 'asc') filtered = [...filtered].reverse()
  } else if (currentSort === 'views') {
    filtered = [...filtered].sort((a, b) => {
      const aViews = viewCount[a.name] || 0
      const bViews = viewCount[b.name] || 0
      if (aViews !== bViews) return sortOrder === 'asc' ? aViews - bViews : bViews - aViews
      return currentDoujinList.indexOf(a) - currentDoujinList.indexOf(b)
    })
  }

  filtered.forEach((doujin) => {
    const card = document.createElement('div')
    card.className = 'thumb-card'

    if (doujin.thumbnail) {
      const img = document.createElement('img')
      img.src = doujin.thumbnail
      card.appendChild(img)
    } else {
      const noImg = document.createElement('div')
      noImg.className = 'thumb-no-image'
      noImg.textContent = doujin.isVideo ? '📹' : '📁'
      card.appendChild(noImg)
    }

    const doujinTags = tags[doujin.name] || []
    const views = viewCount[doujin.name] || 0
    const info = document.createElement('div')
    info.className = 'thumb-info'
    info.innerHTML = `
      <div class="thumb-title">${doujin.name}</div>
      <div class="thumb-count">${doujin.isVideo ? '📹 ' + doujin.count + '개' : doujin.count > 0 ? doujin.count + '페이지' : '폴더'} · 👁 ${views}</div>
      ${doujinTags.length > 0 ? `<div class="thumb-tags">${doujinTags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
    `
    card.appendChild(info)

    card.addEventListener('click', () => openFolder(doujin.folderPath))
    card.addEventListener('contextmenu', (e) => showContextMenu(e, doujin.folderPath))

    let tooltipTimer = null
    card.addEventListener('mouseenter', (e) => {
      tooltipTimer = setTimeout(() => showTooltip(e, doujin.name), 800)
    })
    card.addEventListener('mousemove', (e) => updateTooltipPosition(e))
    card.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimer)
      hideTooltip()
    })

    grid.appendChild(card)
  })
  renderRecommend()
}

function getRecommendedNames() {
  const currentFolder = folderStack[folderStack.length - 1] || ''
  if (!currentFolder.includes('hitomi_downloaded')) return []

  const now = new Date()
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000)

  return currentDoujinList
    .filter(d => {
      const count = viewCount[d.name] || 0
      let isOldEnough = false
      try {
        const stat = require('fs').statSync(d.folderPath)
        isOldEnough = new Date(stat.birthtimeMs) < threeDaysAgo
      } catch (e) {}
      const hasNoTags = !tags[d.name] || tags[d.name].length === 0
      return isOldEnough && ((count === 0) || hasNoTags)
    })
    .slice(0, 6)
    .map(d => d.name)
}

function renderRecommend() {
  const section = document.getElementById('recommend-section')
  const grid = document.getElementById('recommend-grid')

  const currentFolder = folderStack[folderStack.length - 1] || ''
  if (!currentFolder.includes('hitomi_downloaded')) {
    section.style.display = 'none'
    return
  }

  const now = new Date()
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000)

  const recommended = currentDoujinList.filter(d => {
    const count = viewCount[d.name] || 0
    let isOldEnough = false
    try {
      const stat = require('fs').statSync(d.folderPath)
      isOldEnough = new Date(stat.birthtimeMs) < threeDaysAgo
    } catch (e) {}
    const hasNoTags = !tags[d.name] || tags[d.name].length === 0
    return isOldEnough && ((count === 0) || hasNoTags)
  })

  if (recommended.length === 0) { section.style.display = 'none'; return }

  section.style.display = 'block'
  grid.className = `size-${currentSize}`
  grid.innerHTML = ''

  recommended.slice(0, 6).forEach(doujin => {
    const card = document.createElement('div')
    card.className = 'thumb-card'

    if (doujin.thumbnail) {
      const img = document.createElement('img')
      img.src = doujin.thumbnail
      card.appendChild(img)
    } else {
      const noImg = document.createElement('div')
      noImg.className = 'thumb-no-image'
      noImg.textContent = '📁'
      card.appendChild(noImg)
    }

    const doujinTags = tags[doujin.name] || []
    const views = viewCount[doujin.name] || 0
    const info = document.createElement('div')
    info.className = 'thumb-info'
    info.innerHTML = `
      <div class="thumb-title">${doujin.name}</div>
      <div class="thumb-count">${doujin.count > 0 ? doujin.count + '페이지' : '폴더'} · 👁 ${views}</div>
      ${doujinTags.length > 0 ? `<div class="thumb-tags">${doujinTags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
    `
    card.appendChild(info)

    card.addEventListener('click', () => openFolder(doujin.folderPath))
    card.addEventListener('contextmenu', (e) => showContextMenu(e, doujin.folderPath))

    let tooltipTimer = null
    card.addEventListener('mouseenter', (e) => {
      tooltipTimer = setTimeout(() => showTooltip(e, doujin.name), 800)
    })
    card.addEventListener('mousemove', (e) => updateTooltipPosition(e))
    card.addEventListener('mouseleave', () => {
      clearTimeout(tooltipTimer)
      hideTooltip()
    })

    grid.appendChild(card)
  })
}

async function showPage(index) {
  const viewer = document.getElementById('viewer')
  viewer.innerHTML = ''

  const img = document.createElement('img')
  img.src = images[index]
  viewer.appendChild(img)

  document.getElementById('page-info').textContent = `${index + 1} / ${images.length}`
  viewer.scrollTop = 0
  currentPage = index

  document.querySelectorAll('.preview-item').forEach((item, i) => {
    item.className = i === index ? 'preview-item active' : 'preview-item'
  })

  const activeItem = document.querySelector('.preview-item.active')
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }
}

function renderPagePreview() {
  const preview = document.getElementById('page-preview')
  preview.innerHTML = ''

  images.forEach((imgSrc, index) => {
    const item = document.createElement('div')
    item.className = index === 0 ? 'preview-item active' : 'preview-item'

    const img = document.createElement('img')
    img.src = imgSrc
    img.loading = 'lazy'
    item.appendChild(img)

    item.addEventListener('click', () => showPage(index))
    preview.appendChild(item)
  })

  let isDragging = false
  let startX = 0
  let scrollLeft = 0

  preview.addEventListener('mousedown', (e) => {
    isDragging = true
    startX = e.pageX - preview.offsetLeft
    scrollLeft = preview.scrollLeft
    preview.style.cursor = 'grabbing'
  })
  preview.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    e.preventDefault()
    const x = e.pageX - preview.offsetLeft
    preview.scrollLeft = scrollLeft - (x - startX)
  })
  preview.addEventListener('mouseup', () => { isDragging = false; preview.style.cursor = 'grab' })
  preview.addEventListener('mouseleave', () => { isDragging = false; preview.style.cursor = 'grab' })
  preview.style.cursor = 'grab'
}

// 마우스 상단 60px → 툴바 + 미리보기 바 표시
function setViewerHUD(visible) {
  const toolbar = document.getElementById('toolbar')
  const preview = document.getElementById('page-preview')
  if (visible) {
    toolbar.style.opacity = '1'
    toolbar.style.pointerEvents = 'auto'
    preview.style.opacity = '1'
    preview.style.pointerEvents = 'auto'
  } else {
    toolbar.style.opacity = '0'
    toolbar.style.pointerEvents = 'none'
    preview.style.opacity = '0'
    preview.style.pointerEvents = 'none'
  }
}

let hudPinned = false  // 툴바/미리보기 바 위에 마우스가 있으면 true

function handleMouseMove(e) {
  const viewerActive = document.getElementById('viewer-screen').className.includes('active')
  if (!viewerActive) return
  if (hudPinned) return  // 핀 상태면 mousemove로 숨기지 않음

  if (e.clientY < 60) {
    setViewerHUD(true)
  } else {
    setViewerHUD(false)
  }
}

document.getElementById('btn-back').addEventListener('click', async () => {
  if (folderStack.length > 0) {
    const currentFolder = folderStack[folderStack.length - 1]
    const refreshResult = await ipcRenderer.invoke('read-folder', currentFolder)
    if (refreshResult.type === 'folder') {
      currentDoujinList = refreshResult.doujinList
      showLibrary()
      renderThumbnails(document.getElementById('tag-search').value)
      return
    }
  }
  showLibrary()
})

document.getElementById('btn-library-back').addEventListener('click', () => {
  // 영상 뷰어 화면일 때
  const videoActive = document.getElementById('video-viewer-screen').className.includes('active')
  if (videoActive) {
    const video = document.getElementById('main-video')
    video.pause()
    video.src = ''
    if (folderStack.length > 0) {
      const currentFolder = folderStack[folderStack.length - 1]
      ipcRenderer.invoke('read-folder', currentFolder).then(result => {
        if (result.type === 'folder') {
          currentDoujinList = result.doujinList
          showLibrary()
          renderThumbnails()
        }
      })
    } else {
      showLibrary()
    }
    return
  }

  // 기존 라이브러리 동작
  if (folderStack.length > 1) {
    folderStack.pop()
    openFolder(folderStack[folderStack.length - 1], false)
  }
})

document.getElementById('btn-prev').addEventListener('click', () => {
  if (currentPage > 0) showPage(currentPage - 1)
})

document.getElementById('btn-next').addEventListener('click', () => {
  if (currentPage < images.length - 1) showPage(currentPage + 1)
})

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  ipcRenderer.invoke('set-fullscreen', !isFullscreen)
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'F11') {
    ipcRenderer.invoke('set-fullscreen', !isFullscreen)
  }
  if (e.key === 'Escape' && isFullscreen) {
    ipcRenderer.invoke('set-fullscreen', false)
  }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (currentPage < images.length - 1) showPage(currentPage + 1)
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (currentPage > 0) showPage(currentPage - 1)
  }
})

ipcRenderer.on('fullscreen-change', (event, value) => {
  isFullscreen = value
})

// 뷰어 화면 전체화면 시 우클릭으로 해제
document.addEventListener('contextmenu', (e) => {
  const viewerActive = document.getElementById('viewer-screen').className.includes('active')
  if (isFullscreen && viewerActive) {
    e.preventDefault()
    ipcRenderer.invoke('set-fullscreen', false)
  }
})

function showContextMenu(e, folderPath) {
  e.preventDefault()
  rightClickedPath = folderPath
  const menu = document.getElementById('context-menu')
  menu.style.display = 'block'
  menu.style.left = e.clientX + 'px'
  menu.style.top = e.clientY + 'px'
}

document.addEventListener('click', () => {
  if (document.getElementById('tag-modal').style.display === 'flex') return
  document.getElementById('context-menu').style.display = 'none'
})

document.getElementById('menu-move').addEventListener('click', async () => {
  if (rightClickedPath === null) return
  const doujin = currentDoujinList.find(d => d.folderPath === rightClickedPath)
  if (!doujin) return
  const result = await ipcRenderer.invoke('move-folder', doujin.folderPath)
  if (result) {
    currentDoujinList.splice(currentDoujinList.indexOf(doujin), 1)
    renderThumbnails()
  }
})

document.getElementById('menu-delete').addEventListener('click', async () => {
  if (rightClickedPath === null) return
  const doujin = currentDoujinList.find(d => d.folderPath === rightClickedPath)
  if (!doujin) return
  const confirmed = window.confirm(`"${doujin.name}" 을 휴지통으로 보낼까요?`)
  if (!confirmed) return
  const result = await ipcRenderer.invoke('delete-folder', doujin.folderPath)
  if (result) {
    currentDoujinList.splice(currentDoujinList.indexOf(doujin), 1)
    renderThumbnails()
  }
})

// ===== 태그 편집 =====
function getAllTags() {
  const allTags = []
  Object.values(tags).forEach(tagList => {
    tagList.forEach(tag => {
      if (!allTags.includes(tag)) allTags.push(tag)
    })
  })
  return allTags
}

function renderTagBlocks() {
  const container = document.getElementById('tag-block-list')
  container.innerHTML = ''
  if (globalTagList.length === 0) {
    container.innerHTML = '<div style="color:#555; font-size:13px;">태그 없음 — 태그 관리에서 태그를 추가하세요</div>'
    return
  }
  [...globalTagList].sort((a, b) => a.localeCompare(b, 'ko')).forEach(tag => {
    const block = document.createElement('div')
    block.className = 'tag-block' + (currentModalTags.includes(tag) ? ' selected' : '')
    block.textContent = tag
    block.addEventListener('click', () => {
      if (currentModalTags.includes(tag)) {
        currentModalTags = currentModalTags.filter(t => t !== tag)
      } else {
        currentModalTags.push(tag)
      }
      block.className = 'tag-block' + (currentModalTags.includes(tag) ? ' selected' : '')
    })
    container.appendChild(block)
  })
}

document.getElementById('tag-modal').addEventListener('click', (e) => { e.stopPropagation() })

document.getElementById('menu-tag').addEventListener('click', () => {
  if (rightClickedPath === null) return
  const doujin = currentDoujinList.find(d => d.folderPath === rightClickedPath)
  if (!doujin) return
  currentModalTags = [...(tags[doujin.name] || [])]
  document.getElementById('tag-modal-name').textContent = doujin.name
  document.getElementById('tag-modal').style.display = 'flex'
  renderTagBlocks()
})

document.getElementById('tag-cancel').addEventListener('click', () => {
  document.getElementById('tag-modal').style.display = 'none'
})

document.getElementById('tag-save').addEventListener('click', async () => {
  if (rightClickedPath === null) return
  const doujin = currentDoujinList.find(d => d.folderPath === rightClickedPath)
  if (!doujin) return
  tags[doujin.name] = [...currentModalTags].sort((a, b) => a.localeCompare(b, 'ko'))
  await ipcRenderer.invoke('save-tags', tags)
  document.getElementById('tag-modal').style.display = 'none'
  document.getElementById('context-menu').style.display = 'none'
  renderThumbnails(document.getElementById('tag-search').value)
})

// ===== 태그 관리 =====
function renderTagManageList(filter = '') {
  const list = document.getElementById('tag-manage-list')
  list.innerHTML = ''
  const filtered = filter
    ? [...globalTagList].filter(t => t.toLowerCase().includes(filter.toLowerCase()))
    : [...globalTagList]
  filtered.sort((a, b) => a.localeCompare(b, 'ko'))
  if (filtered.length === 0) {
    list.innerHTML = `<div style="color:#555; font-size:13px; padding:8px;">${filter ? '검색 결과 없음' : '태그 없음'}</div>`
    return
  }
  filtered.forEach(tag => {
    const item = document.createElement('div')
    item.className = 'tag-manage-item'
    item.innerHTML = `<span>${tag}</span><span class="tag-remove">×</span>`
    item.querySelector('.tag-remove').addEventListener('click', () => {
      globalTagList = globalTagList.filter(t => t !== tag)
      Object.keys(tags).forEach(name => { tags[name] = tags[name].filter(t => t !== tag) })
      ipcRenderer.invoke('save-tags', tags)
      renderTagManageList(document.getElementById('tag-manage-search').value)
    })
    list.appendChild(item)
  })
}

function addGlobalTag() {
  const input = document.getElementById('tag-manage-input')
  const value = input.value.trim()
  if (!value || globalTagList.includes(value)) { input.value = ''; return }
  globalTagList.push(value)
  input.value = ''
  renderTagManageList(document.getElementById('tag-manage-search').value)
  input.focus()
}

document.getElementById('tag-manage-modal').addEventListener('click', (e) => { e.stopPropagation() })
document.getElementById('btn-tag-manage').addEventListener('click', () => {
  document.getElementById('tag-manage-search').value = ''
  document.getElementById('tag-manage-modal').style.display = 'flex'
  renderTagManageList()
  setTimeout(() => document.getElementById('tag-manage-search').focus(), 100)
})
document.getElementById('tag-manage-search').addEventListener('input', (e) => { renderTagManageList(e.target.value) })
document.getElementById('tag-manage-add').addEventListener('click', addGlobalTag)
document.getElementById('tag-manage-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addGlobalTag() })
document.getElementById('tag-manage-close').addEventListener('click', () => {
  document.getElementById('tag-manage-modal').style.display = 'none'
  renderThumbnails(document.getElementById('tag-search').value)
})

// ===== 태그 검색 =====
document.getElementById('tag-search').addEventListener('input', (e) => { renderThumbnails(e.target.value) })

// ===== 썸네일 크기 =====
function setSize(size) {
  currentSize = 'small'
  document.getElementById('thumbnail-grid').className = 'size-small'
}

// ===== 설정 =====
async function saveSettings() {
  await ipcRenderer.invoke('save-settings', { size: currentSize })
}

async function loadSettings() {
  tags = await ipcRenderer.invoke('load-tags')
  globalTagList = getAllTags()
  viewCount = await ipcRenderer.invoke('load-viewcount')
  lastViewed = await ipcRenderer.invoke('load-lastviewed')
  const settings = await ipcRenderer.invoke('load-settings')
  if (settings.size) { currentSize = settings.size; setSize(currentSize) }
}

async function init() {
  images = []
  currentPage = 0
  await loadSettings()
  const libraryPath = await ipcRenderer.invoke('get-library-path')
  await openFolder(libraryPath)
}

// ===== 정렬 =====
document.getElementById('btn-sort').addEventListener('click', (e) => {
  e.stopPropagation()
  const menu = document.getElementById('sort-menu')
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none'
})

document.querySelectorAll('.sort-item').forEach(item => {
  item.addEventListener('click', () => {
    currentSort = item.dataset.sort
    document.getElementById('btn-sort').textContent = `${currentSort === 'date' ? '추가됨' : '조회수'} ▼`
    document.querySelectorAll('.sort-item').forEach(i => i.className = 'sort-item')
    item.className = 'sort-item active'
    document.getElementById('sort-menu').style.display = 'none'
    renderThumbnails(document.getElementById('tag-search').value)
  })
})

document.getElementById('btn-order').addEventListener('click', () => {
  sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'
  document.getElementById('btn-order').textContent = sortOrder === 'asc' ? '오름차순 ↑' : '내림차순 ↓'
  renderThumbnails(document.getElementById('tag-search').value)
})

document.addEventListener('click', () => {
  if (document.getElementById('tag-modal').style.display === 'flex') return
  document.getElementById('sort-menu').style.display = 'none'
})

// ===== 툴팁 =====
function showTooltip(e, text) {
  let tooltip = document.getElementById('tooltip')
  if (!tooltip) {
    tooltip = document.createElement('div')
    tooltip.id = 'tooltip'
    tooltip.style.cssText = `position:fixed; background:rgba(0,0,0,0.85); color:#fff; padding:5px 10px; border-radius:4px; font-size:12px; max-width:300px; word-break:break-all; z-index:99999; pointer-events:none;`
    document.body.appendChild(tooltip)
  }
  tooltip.textContent = text
  tooltip.style.display = 'block'
  updateTooltipPosition(e)
}

function updateTooltipPosition(e) {
  const tooltip = document.getElementById('tooltip')
  if (!tooltip || tooltip.style.display === 'none') return
  tooltip.style.left = (e.clientX + 12) + 'px'
  tooltip.style.top = (e.clientY + 12) + 'px'
}

function hideTooltip() {
  const tooltip = document.getElementById('tooltip')
  if (tooltip) tooltip.style.display = 'none'
}

// ===== 마우스 뒤로가기 =====
document.addEventListener('mousedown', (e) => {
  if (e.button === 3) {
    if (document.getElementById('viewer-screen').className.includes('active')) {
      document.getElementById('btn-back').click()
    } else if (folderStack.length > 1) {
      document.getElementById('btn-library-back').click()
    }
  }
})

// ===== 앱 종료 =====
document.getElementById('btn-close').addEventListener('click', () => {
  ipcRenderer.invoke('quit-app')
})


// ===== 뷰어 HUD 고정 (뷰어 화면일 때만 동작) =====
document.getElementById('toolbar').addEventListener('mouseenter', () => {
  const viewerActive = document.getElementById('viewer-screen').className.includes('active')
  if (viewerActive) hudPinned = true
})
document.getElementById('toolbar').addEventListener('mouseleave', () => {
  hudPinned = false
  const viewerActive = document.getElementById('viewer-screen').className.includes('active')
  if (viewerActive) setViewerHUD(false)
})
document.getElementById('page-preview').addEventListener('mouseenter', () => {
  const viewerActive = document.getElementById('viewer-screen').className.includes('active')
  if (viewerActive) hudPinned = true
})
document.getElementById('page-preview').addEventListener('mouseleave', () => {
  hudPinned = false
  const viewerActive = document.getElementById('viewer-screen').className.includes('active')
  if (viewerActive) setViewerHUD(false)
})


init()
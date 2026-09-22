/**
 * `dump-svg.js`'s `getBBox` stub, verbatim, as a function of a jsdom `document`.
 *
 * Every golden in both corpora was made under these text metrics (the sibling
 * `../abcMusicKit/Tools/abcjs-debug/dump-svg.js`), so a harvester that runs abcjs must
 * patch the page the same way or lay a tune out 1.78px differently. This used to live at
 * `/tmp/gp/bbox-stub.js` — a scratchpad file that `/tmp` cleaning deleted — and
 * `harvest-abcjs-sequence.mjs` could not run until it was recreated. It lives here now.
 *
 * `tools` is the sibling `abcjs-debug` directory, for `dump-elements-char-widths.js`.
 */
const path = require('node:path')

module.exports = (document, tools) => {
  const charWidths = require(path.join(tools, 'dump-elements-char-widths.js'))
  const fontHeights = { 27: 29.91, 21: 23.27, 20: 22.16, 19: 21.06, 17: 18.84, 16: 18.52, 15: 17.5 }
  const calcWidth = (text, fontSize, fontWeight) => {
    if (!text) return 0
    let fontType = 'repeatfont'
    if (fontSize >= 27) fontType = 'titlefont'
    else if (fontSize >= 21) fontType = 'subtitlefont'
    else if (fontSize >= 20) fontType = 'partsfont'
    else if (fontSize >= 19) fontType = 'measurefont'
    else if (fontSize >= 17) fontType = fontWeight === 'bold' ? 'vocalfont' : 'repeatfont'
    else if (fontSize >= 16) fontType = 'gchordfont'
    const widths = charWidths[fontType] || charWidths.repeatfont || {}
    let maxWidth = 0
    for (const line of text.split('\n')) {
      let lineWidth = 0
      for (const ch of line) lineWidth += widths[ch] || 8
      if (lineWidth > maxWidth) maxWidth = lineWidth
    }
    return maxWidth
  }
  const origCreateElementNS = document.createElementNS.bind(document)
  document.createElementNS = (ns, tag) => {
    const el = origCreateElementNS(ns, tag)
    if (tag === 'text' || tag === 'tspan') {
      el.getBBox = () => {
        const fontSize = parseFloat(el.getAttribute('font-size')) || 16
        let fontWeight = el.getAttribute('font-weight') || 'normal'
        if (fontWeight === 'normal' && el.parentElement)
          fontWeight = el.parentElement.getAttribute('font-weight') || 'normal'
        let h = fontHeights[Math.round(fontSize)] || fontSize + 2
        let w = 0
        const tspans = el.querySelectorAll ? el.querySelectorAll('tspan') : []
        if (tspans.length > 0) {
          let nonEmpty = 0
          for (const tspan of tspans) {
            const ttext = tspan.textContent || ''
            if (ttext.length > 0) {
              w = Math.max(w, calcWidth(ttext, fontSize, fontWeight))
              nonEmpty++
            }
          }
          if (nonEmpty > 1) h = h + (nonEmpty - 1) * fontSize * 1.2
        } else {
          w = calcWidth(el.textContent || '', fontSize, fontWeight)
        }
        return { x: 0, y: 0, width: w, height: h }
      }
    }
    return el
  }
}

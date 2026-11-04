import assert from 'node:assert/strict'

// Sample the actual painted background beneath each visible text label. Hiding
// glyphs for the capture retains gradients, the dimming layer and badge surfaces.
export async function dimmedLabelContrast(page) {
  const results = []
  for (const look of [
    'powder',
    'instrument',
    'vintage',
    'learner',
    'crystal',
    'bio',
    'monolith',
    'terminal',
    'neon',
    'bare',
  ]) {
    await page.evaluate(
      async (look) => (await import('/scripts/rack-feel-check.mjs')).loadLook(look),
      look,
    )
    const labels = await page.evaluate(() => {
      const labels = []
      for (const panel of document.querySelectorAll('.module-panel.inactive')) {
        const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode
          if (!node.textContent.trim()) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          const rect = range.getBoundingClientRect()
          if (!rect.width || !rect.height) continue
          const element = node.parentElement
          // Scrolled-out text still has a DOM rect; sample only its actual painted center.
          if (
            !element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            )
          )
            continue
          let opacity = 1
          for (let item = element; item && item !== panel.parentElement; item = item.parentElement)
            opacity *= getComputedStyle(item).opacity
          labels.push({
            text: node.textContent.trim(),
            id: panel.dataset.module,
            color: getComputedStyle(element).color,
            opacity,
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
          })
        }
      }
      return labels
    })
    const hide = await page.addStyleTag({
      content: '.module-panel * {color:transparent !important; text-shadow:none !important;}',
    })
    let screenshot
    try {
      screenshot = (await page.screenshot()).toString('base64')
    } finally {
      await hide.evaluate((element) => element.remove())
    }
    const contrasts = await page.evaluate(
      async ({ labels, screenshot }) => {
        const bitmap = await createImageBitmap(
          await (await fetch('data:image/png;base64,' + screenshot)).blob(),
        )
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        context.drawImage(bitmap, 0, 0)
        const colorContext = document.createElement('canvas').getContext('2d')
        const luminance = (rgb) =>
          rgb
            .map((value) => {
              const c = value / 255
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
            })
            .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
        return labels
          .map((label) => {
            const background = [
              ...context.getImageData(Math.floor(label.x), Math.floor(label.y), 1, 1).data,
            ].slice(0, 3)
            colorContext.clearRect(0, 0, 1, 1)
            colorContext.fillStyle = label.color
            colorContext.fillRect(0, 0, 1, 1)
            const color = [...colorContext.getImageData(0, 0, 1, 1).data]
            const alpha = (label.opacity * color[3]) / 255
            const foreground = color
              .slice(0, 3)
              .map((value, index) => alpha * value + (1 - alpha) * background[index])
            const a = luminance(foreground),
              b = luminance(background)
            return {
              id: label.id,
              text: label.text,
              ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
            }
          })
          .sort((a, b) => a.ratio - b.ratio)
      },
      { labels, screenshot },
    )
    assert(contrasts.length > 0, `No dimmed labels tested for ${look}`)
    assert(
      contrasts.every((label) => label.ratio >= 4.5),
      `${look}: ${JSON.stringify(contrasts.filter((label) => label.ratio < 4.5))}`,
    )
    results.push({ look, labels: contrasts.length, minimum: contrasts[0] })
  }
  return results
}

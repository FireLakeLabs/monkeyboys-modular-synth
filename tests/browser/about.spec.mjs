import { test, expect } from 'playwright/test'

for (const width of [1600, 640, 390]) {
  test(`About and source links work at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    const about = page.getByRole('button', { name: 'About', exact: true })
    const github = page.getByRole('link', { name: 'Source on GitHub' })
    const strudel = page.getByRole('link', { name: 'Strudel', exact: true })
    await expect(github).toHaveAttribute(
      'href',
      'https://github.com/FireLakeLabs/monkeyboys-modular-synth',
    )
    await expect(strudel).toHaveAttribute('href', 'https://strudel.cc')
    const [g, s] = await Promise.all([github.boundingBox(), strudel.boundingBox()])
    expect(g.width).toBe(s.width)
    expect(g.height).toBe(s.height)
    if (width < 700) expect(g.width).toBeGreaterThanOrEqual(44)
    await about.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'About MonkeyBoy’s Modular Synth' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('no warranty')
    await expect(dialog.getByRole('link', { name: 'Source for this version' })).toHaveAttribute(
      'href',
      /\/tree\/[a-f\d]{40}$/,
    )
    const noticesUrl = await dialog
      .getByRole('link', { name: 'Full license texts and third-party notices' })
      .getAttribute('href')
    const response = await request.get(noticesUrl)
    expect(response.ok()).toBe(true)
    expect(await response.text()).toContain('GNU AFFERO GENERAL PUBLIC LICENSE')
    expect(await response.text()).toContain('Modified Strudel / Superdough')
    await dialog.getByText('Music, samples and artwork', { exact: true }).click()
    await expect(dialog).toContainText('remain unverified')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    )
    await page.screenshot({ path: `test-results/about-${width}.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(about).toBeFocused()
    await about.click()
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(about).toBeFocused()
  })
}

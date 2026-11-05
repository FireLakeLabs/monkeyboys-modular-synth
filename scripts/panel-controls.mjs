/** Reads a catalog switch's option value from whichever control the panel shows. */
export async function switchValue(panel, label) {
  const group = panel.getByRole('radiogroup', { name: label, exact: true })
  if (await group.count()) return group.locator('input:checked').inputValue()
  const toggle = panel.getByRole('button', { name: label, exact: true })
  if (await toggle.count())
    return (await toggle.getAttribute('aria-pressed')) === 'true' ? 'on' : 'off'
  return panel.getByRole('combobox', { name: label, exact: true }).inputValue()
}

/** Sets a catalog switch through whichever control the panel currently shows. */
export async function chooseSwitch(panel, label, value) {
  const group = panel.getByRole('radiogroup', { name: label, exact: true })
  if (await group.count()) {
    await group.locator(`input[value="${value}"]`).check()
    return
  }
  const toggle = panel.getByRole('button', { name: label, exact: true })
  if (await toggle.count()) {
    if ((await toggle.getAttribute('aria-pressed')) !== String(value === 'on')) await toggle.click()
    return
  }
  await panel.getByRole('combobox', { name: label, exact: true }).selectOption(value)
}

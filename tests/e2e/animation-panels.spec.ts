// The teacher's Windows / Mac check (2026-11-15): dragging the playhead selected the words of
// the whole window (every mode); a folder could not be filled with layers by dragging; the
// Properties number boxes squeezed their labels.
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './app.ts';

async function animationMode(page: Page) {
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Animation' })
    .click();
  await expect(page.getByRole('application', { name: 'Stage' })).toBeVisible();
}

test('dragging the playhead off the ruler, across the panels, selects no text', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const ruler = (await page.getByRole('slider', { name: 'Playhead' }).boundingBox())!;
  await page.mouse.move(ruler.x + 20, ruler.y + 5);
  await page.mouse.down();
  await page.mouse.move(ruler.x + 200, ruler.y + 200, { steps: 8 });
  await page.mouse.move(ruler.x - 400, ruler.y + 150, { steps: 8 }); // over the Layers panel
  await page.mouse.move(ruler.x + 300, ruler.y - 300, { steps: 8 }); // over the stage
  await page.mouse.up();
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
  await expect(page.getByRole('slider', { name: 'Playhead' })).not.toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  await app.close();
});

test('in Video and Audio mode too, dragging on the ruler across the window selects no text', async () => {
  const { app, window: page } = await launchApp();
  const across = async (box: { x: number; y: number }) => {
    await page.mouse.move(box.x + 30, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y - 300, { steps: 8 });
    await page.mouse.move(box.x - 300, box.y + 150, { steps: 8 });
    await page.mouse.up();
    return page.evaluate(() => String(getSelection()));
  };
  expect(await across((await page.locator('.ruler').first().boundingBox())!)).toBe('');
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Audio' })
    .click();
  const scale = page.getByRole('slider', { name: 'Audio position on the ruler' });
  expect(await across((await scale.boundingBox())!)).toBe('');
  await app.close();
});

test('Folder holds the selected layer; another layer is dragged into it', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const panel = page.getByRole('complementary', { name: 'Layers' });
  await panel.getByRole('button', { name: 'Folder', exact: true }).click();
  await expect(panel.getByText('1 layer', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Layer', exact: true }).click(); // Layer 2, in the folder
  await panel.getByRole('button', { name: 'Move Layer 2 to a folder' }).click();
  await panel.getByLabel('Folder of Layer 2').selectOption({ label: 'No folder' });
  await expect(panel.getByText('1 layer', { exact: true })).toBeVisible();
  await panel
    .getByRole('option', { name: 'Layer 2' })
    .dragTo(panel.locator('li.folder', { hasText: 'Folder' }));
  await expect(panel.getByText('2 layers', { exact: true })).toBeVisible();
  await app.close();
});

test('a Properties label stays on one line: the number box is only as wide as its number', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  await page
    .getByRole('button', { name: /^Rectangle/ })
    .first()
    .click();
  const stage = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  await page.mouse.move(stage.x + stage.width * 0.3, stage.y + stage.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5, { steps: 4 });
  await page.mouse.up();
  for (const label of ['Rotation', 'Opacity', 'Radius']) {
    const box = (await page.getByText(label, { exact: true }).first().boundingBox())!;
    expect(box.height, label).toBeLessThan(20);
  }
  const input = page.getByLabel('Rotation', { exact: true });
  expect(await input.evaluate((i) => getComputedStyle(i).textAlign)).toBe('right');

  // Words in boxes and lists sit on the right too; Add effect and each "Why use this?" as well.
  const panel = page.getByRole('complementary', { name: 'Properties' });
  const aligns = await panel.evaluate((p) => ({
    boxes: [...p.querySelectorAll('input[type="text"]')].map((i) => getComputedStyle(i).textAlign),
  }));
  expect(new Set(aligns.boxes)).toEqual(new Set(['right']));
  // A list's words end at its right, by the arrow (a menu is a flex box: base-select).
  const lists = await panel.evaluate((p) =>
    [...p.querySelectorAll('select')]
      .filter((s) => (s as HTMLElement).offsetParent)
      .map((s) => getComputedStyle(s).justifyContent),
  );
  expect(lists.length).toBeGreaterThan(2);
  expect(new Set(lists)).toEqual(new Set(['safe flex-end']));
  const right = async (name: string, nth = 0) => {
    const el = panel.getByRole('button', { name }).nth(nth);
    await el.scrollIntoViewIfNeeded();
    const box = (await el.boundingBox())!;
    const body = (await panel.locator('.body').boundingBox())!;
    return body.x + body.width - (box.x + box.width);
  };
  // Within the panel's padding and scroll bar of its right edge.
  expect(await right('Add effect')).toBeLessThan(30);
  expect(await right('Why use this?')).toBeLessThan(30);
  await app.close();
});

test('the folder box shows only when asked for (Move to a folder)', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const panel = page.getByRole('complementary', { name: 'Layers' });
  await panel.getByRole('button', { name: 'Folder', exact: true }).click();
  await expect(panel.getByLabel('Folder of Layer 1')).toBeHidden();
  await panel.getByRole('button', { name: 'Move Layer 1 to a folder' }).click();
  await panel.getByLabel('Folder of Layer 1').selectOption({ label: 'No folder' });
  await expect(panel.getByLabel('Folder of Layer 1')).toBeHidden();
  await expect(panel.getByText('0 layers', { exact: true })).toBeVisible();
  await app.close();
});

test('Search properties: typing shows only the matching settings, and types no shortcuts', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  await page
    .getByRole('button', { name: /^Rectangle/ })
    .first()
    .click();
  const stage = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  await page.mouse.move(stage.x + stage.width * 0.3, stage.y + stage.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.5, stage.y + stage.height * 0.5, { steps: 4 });
  await page.mouse.up();
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await panel.getByRole('searchbox', { name: 'Search properties' }).pressSequentially('opac');
  await expect(panel.getByLabel('Opacity', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Rotation', { exact: true })).toBeHidden();
  // "o" is the Ellipse tool's key: typing in the box chose no tool.
  await expect(page.getByRole('button', { name: /^Ellipse/ }).first()).not.toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await panel.getByRole('searchbox').press('Escape');
  await expect(panel.getByLabel('Rotation', { exact: true })).toBeVisible();
  await app.close();
});

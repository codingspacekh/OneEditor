// Pilot request 2026-11-18 (AN11), with a real mouse: the Earth follows an orbit round the Sun
// anticlockwise, and the Moon moves with the Earth — at a later frame the Moon has moved by as
// much as the Earth has; dragging the Earth drags the Moon along.
import { expect, test, type Page } from '@playwright/test';
import { launchApp, pickTool } from './app.ts';

async function animationMode(page: Page) {
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Animation' })
    .click();
  await expect(page.getByRole('application', { name: 'Stage' })).toBeVisible();
}

async function stageAt(page: Page) {
  const b = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  return (fx: number, fy: number): [number, number] => [b.x + fx * b.width, b.y + fy * b.height];
}

async function dragOn(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
}

/** Draws an ellipse and names it. */
async function ellipse(page: Page, from: [number, number], to: [number, number], name: string) {
  await pickTool(page, 'Ellipse');
  await dragOn(page, from, to);
  const props = page.getByRole('complementary', { name: 'Properties' });
  await props.getByLabel('Name', { exact: true }).fill(name);
  await props.getByLabel('Name', { exact: true }).press('Enter');
}

const xOf = async (page: Page) =>
  Number(
    await page
      .getByRole('complementary', { name: 'Properties' })
      .getByLabel('X', { exact: true })
      .inputValue(),
  );

test('the Moon moves with the Earth as the Earth goes round the Sun', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const at = await stageAt(page);
  await ellipse(page, at(0.25, 0.25), at(0.75, 0.75), 'Orbit');
  await ellipse(page, at(0.47, 0.47), at(0.53, 0.53), 'Sun');
  await ellipse(page, at(0.72, 0.47), at(0.78, 0.53), 'Earth');
  const props = page.getByRole('complementary', { name: 'Properties' });
  await props.getByLabel('Follow path').selectOption({ label: 'Orbit' });
  await props.getByLabel('Path 1 direction').selectOption({ label: 'Anticlockwise' });
  await ellipse(page, at(0.85, 0.48), at(0.87, 0.52), 'Moon');
  await props.getByLabel('Moves with').selectOption({ label: 'Earth' });
  await props.getByLabel('Moves with').scrollIntoViewIfNeeded();
  await props.screenshot({ path: test.info().outputPath('moves-with.png') });
  const moonAt0 = await xOf(page);
  const layers = page.getByRole('list', { name: 'Objects in Layer 1' });
  await layers.getByRole('button', { name: 'Select Earth' }).click();
  const earthAt0 = await xOf(page);
  await page.getByLabel('Go to frame').fill('30');
  await page.getByLabel('Go to frame').press('Enter');
  const earthAt30 = await xOf(page);
  expect(Math.abs(earthAt30 - earthAt0)).toBeGreaterThan(5);
  await layers.getByRole('button', { name: 'Select Moon' }).click();
  expect(await xOf(page)).toBeCloseTo(moonAt0 + (earthAt30 - earthAt0), 0);
  await app.close();
});

test('dragging the Sun takes the Earth along, once', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const at = await stageAt(page);
  await ellipse(page, at(0.2, 0.4), at(0.3, 0.6), 'Sun');
  await ellipse(page, at(0.6, 0.45), at(0.66, 0.55), 'Earth');
  const props = page.getByRole('complementary', { name: 'Properties' });
  await props.getByLabel('Moves with').selectOption({ label: 'Sun' });
  const earthBefore = await xOf(page);
  await pickTool(page, 'Select');
  await dragOn(page, at(0.25, 0.5), at(0.35, 0.5));
  const layers = page.getByRole('list', { name: 'Objects in Layer 1' });
  const sunAfter = await xOf(page);
  await layers.getByRole('button', { name: 'Select Earth' }).click();
  const earthAfter = await xOf(page);
  await layers.getByRole('button', { name: 'Select Sun' }).click();
  expect(sunAfter).toBe(await xOf(page));
  expect(earthAfter - earthBefore).toBeGreaterThan(5);
  await app.close();
});

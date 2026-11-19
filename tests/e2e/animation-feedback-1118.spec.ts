// Pilot feedback 2026-11-18 on Animation mode, with a real mouse and keyboard: the Layers panel
// lists a layer's objects (select, rename, delete); the pen ends its path when another tool is
// chosen, makes a curve point by a click and drag, and a segment is bent by dragging it; a
// keyframe made by mistake is removed by Delete on its dot or by Remove keyframe.
import { expect, test, type Page } from '@playwright/test';
import { launchApp, pickTool } from './app.ts';

async function animationMode(page: Page) {
  await page
    .getByRole('navigation', { name: 'Mode' })
    .getByRole('button', { name: 'Animation' })
    .click();
  await expect(page.getByRole('application', { name: 'Stage' })).toBeVisible();
}

/** A point of the stage's canvas, as fractions of its width and height (any window size). */
async function stageBox(page: Page) {
  const b = (await page.getByRole('application', { name: 'Stage' }).boundingBox())!;
  return (fx: number, fy: number): [number, number] => [b.x + fx * b.width, b.y + fy * b.height];
}

async function dragOn(page: Page, from: [number, number], to: [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
}

test('the Layers panel lists, selects, renames and deletes a layer’s objects', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const at = await stageBox(page);
  await pickTool(page, 'Rectangle');
  await dragOn(page, at(0.1, 0.08), at(0.3, 0.2));
  await pickTool(page, 'Ellipse');
  await dragOn(page, at(0.4, 0.08), at(0.6, 0.2));
  const layers = page.getByRole('complementary', { name: 'Layers' });
  const list = layers.getByRole('list', { name: 'Objects in Layer 1' });
  await expect(list.getByRole('button', { name: /^Select / })).toHaveText(['Ellipse', 'Rectangle']);
  await layers.screenshot({ path: test.info().outputPath('layers-objects.png') });
  await list.getByRole('button', { name: 'Select Rectangle' }).dblclick();
  await layers.getByLabel('Object name').fill('Sun');
  await layers.getByLabel('Object name').press('Enter');
  await expect(list.getByRole('button', { name: 'Select Sun' })).toBeVisible();
  await list.getByRole('button', { name: 'Delete Ellipse' }).click();
  await expect(list.getByRole('button', { name: /^Select / })).toHaveText(['Sun']);
  await app.close();
});

test('the pen: a click and drag curves, another tool ends the path, a segment bends', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const at = await stageBox(page);
  await pickTool(page, 'Pen');
  await page.mouse.click(...at(0.15, 0.4));
  await dragOn(page, at(0.4, 0.24), at(0.55, 0.24));
  await page.mouse.click(...at(0.75, 0.4));
  await page.mouse.move(...at(0.85, 0.48));
  await expect(page.locator('.stage-area path.pen')).toHaveCount(1);
  await pickTool(page, 'Rectangle');
  await expect(page.locator('.stage-area path.pen')).toHaveCount(0);
  // The path is kept; selected, the dragged middle point shows its two curve handles.
  await pickTool(page, 'Select');
  await page
    .getByRole('list', { name: 'Objects in Layer 1' })
    .getByRole('button', { name: 'Select Path' })
    .click();
  await expect(page.locator('.stage-area circle.curve-handle')).toHaveCount(2);
  // Escape throws away a path being drawn, even with a tool button focused.
  await pickTool(page, 'Pen');
  await page.mouse.click(...at(0.15, 0.6));
  await page.mouse.click(...at(0.5, 0.6));
  await page.keyboard.press('Escape');
  await expect(page.locator('.stage-area path.pen')).toHaveCount(0);
  // A straight segment of the selected path dragged bends.
  await pickTool(page, 'Line');
  await dragOn(page, at(0.15, 0.8), at(0.75, 0.8));
  await expect(page.getByLabel('Segment 1')).toHaveCount(1);
  await dragOn(page, at(0.45, 0.8), at(0.45, 0.68));
  // Bent: the segment's two ends have a handle each.
  await expect(page.locator('.stage-area circle.curve-handle')).toHaveCount(2);
  await app.close();
});

test('a keyframe made by mistake: Delete on its dot, or Remove keyframe', async () => {
  const { app, window: page } = await launchApp();
  await animationMode(page);
  const at = await stageBox(page);
  await pickTool(page, 'Rectangle');
  await dragOn(page, at(0.1, 0.08), at(0.3, 0.2));
  await page.getByLabel('Go to frame').fill('30');
  await page.getByLabel('Go to frame').press('Enter');
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await timeline.getByRole('button', { name: 'Insert keyframe' }).click();
  const dot = timeline.getByRole('button', { name: 'X keyframe at frame 30' });
  await dot.click();
  await page.keyboard.press('Delete');
  await expect(dot).toHaveCount(0);
  // The object is still there; the other properties' keyframes go with Remove keyframe.
  await expect(
    page.getByRole('list', { name: 'Objects in Layer 1' }).getByRole('button', {
      name: 'Select Rectangle',
    }),
  ).toBeVisible();
  const remove = timeline.getByRole('button', { name: 'Remove keyframes at the playhead' });
  await expect(remove).toBeEnabled();
  await remove.click();
  await expect(timeline.getByRole('button', { name: /keyframe at frame 30$/ })).toHaveCount(0);
  await expect(remove).toBeDisabled();
  await app.close();
});

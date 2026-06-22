import { test, expect } from '@playwright/test';

test.describe('Chatbot E2E User Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Vite dev server typically runs on 5173
    await page.goto('http://localhost:5173');
  });

  test('User can open widget, send message, and receive bot response', async ({ page }) => {
    // 1. Open the chat widget
    const orbButton = page.locator('button[aria-label="Open Chat"]');
    await expect(orbButton).toBeVisible();
    await orbButton.click();

    // 2. Verify welcome message
    const chatWidget = page.locator('.chat-input');
    await expect(chatWidget).toBeVisible();
    await expect(page.locator('text=Hi! I am the Raise Smart AI')).toBeVisible();

    // 3. Send a message
    await chatWidget.fill('What is the B.Tech fee?');
    await page.keyboard.press('Enter');

    // 4. Verify user message appears
    await expect(page.locator('text=What is the B.Tech fee?')).toBeVisible();

    // 5. Verify bot responds
    const botResponse = page.locator('.msg-bot').nth(1);
    await expect(botResponse).toBeVisible({ timeout: 15000 });
  });
});

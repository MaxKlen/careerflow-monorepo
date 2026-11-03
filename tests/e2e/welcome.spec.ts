import { expect, test } from "@playwright/test";

test("public welcome page exposes the two primary actions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "CareerFlow" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create account" }),
  ).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute(
    "href",
    "/signin",
  );
});

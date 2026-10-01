import { buildObjectPath, isOwnedPath, ownerPrefix } from "../../../../lib/consultant/server/storage";

const ME = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const OBJ = "0b6c7c1e-8a1d-4d7e-9c55-0123456789ab";

describe("storage path ownership", () => {
  test("issued paths are <purpose>/<owner>/<uuid>.<ext>", () => {
    expect(buildObjectPath("goal_image", ME, "image/png", OBJ)).toBe(`goal_image/${ME}/${OBJ}.png`);
    expect(buildObjectPath("payment_proof", ME, "application/pdf", OBJ)).toBe(`payment_proof/${ME}/${OBJ}.pdf`);
    expect(ownerPrefix("goal_image", ME.toUpperCase())).toBe(`goal_image/${ME}/`);
  });

  test("accepts only the caller's own prefix and a valid object name", () => {
    expect(isOwnedPath(`goal_image/${ME}/${OBJ}.jpg`, "goal_image", ME)).toBe(true);
    expect(isOwnedPath(`payment_proof/${ME}/${OBJ}.pdf`, "payment_proof", ME)).toBe(true);
    const bad = [
      `goal_image/${OTHER}/${OBJ}.jpg`, // someone else's
      `goal_image/${ME}/${OBJ}.pdf`, // a PDF is never a goal image
      `goal_image/${ME}/../${OTHER}/${OBJ}.jpg`,
      `goal_image/${ME}/sub/${OBJ}.jpg`,
      `/goal_image/${ME}/${OBJ}.jpg`,
      `goal_image/${ME}/${OBJ}.jpg?x=1`,
      `goal_image/${ME}/not-a-uuid.jpg`,
      "",
    ];
    for (const p of bad) expect(isOwnedPath(p, "goal_image", ME)).toBe(false);
    // Right owner, wrong purpose.
    expect(isOwnedPath(`payment_proof/${ME}/${OBJ}.jpg`, "goal_image", ME)).toBe(false);
    expect(isOwnedPath(`goal_image/${ME}/${OBJ}.jpg`, "payment_proof", ME)).toBe(false);
    expect(isOwnedPath(`goal_image/${ME}/${OBJ}.jpg`, "goal_image", null)).toBe(false);
    expect(isOwnedPath(42, "goal_image", ME)).toBe(false);
  });
});

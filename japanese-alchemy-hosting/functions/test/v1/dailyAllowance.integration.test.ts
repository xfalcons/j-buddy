import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
const integrationDescribe = emulatorHost ? describe : describe.skip;

integrationDescribe("daily allowance Firestore transactions", () => {
  let firestore: ReturnType<typeof getFirestore>;
  let app: ReturnType<typeof initializeApp>;
  let admitDailyAllowance: typeof import("../../src/v1/dailyAllowance").admitDailyAllowance;

  beforeAll(async () => {
    app = initializeApp({ projectId: "japanese-alchemy-test" });
    firestore = getFirestore(app);
    ({ admitDailyAllowance } = await import("../../src/v1/dailyAllowance"));
    await firestore.recursiveDelete(firestore.collection("dailyAllowances"));
  });

  afterAll(async () => {
    await firestore.recursiveDelete(firestore.collection("dailyAllowances"));
    await deleteApp(app);
  });

  it("caps concurrent requests at 20 for the same user and IP", async () => {
    for (let index = 0; index < 18; index += 1) {
      const decision = await admitDailyAllowance({
        uid: "concurrent-user",
        ip: "203.0.113.20",
        activeHmacKey: "integration-active-key",
        endpoint: "integration-test",
      });
      expect(decision.allowed).toBe(true);
    }

    const decisions = await Promise.all(
      Array.from({ length: 5 }, () => admitDailyAllowance({
        uid: "concurrent-user",
        ip: "203.0.113.20",
        activeHmacKey: "integration-active-key",
        endpoint: "integration-test",
      }))
    );

    expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(2);
    expect(decisions.filter(({ allowed }) => !allowed)).toHaveLength(3);

    const userSnapshot = await firestore
      .collection("dailyAllowances")
      .where("count", "==", 20)
      .get();
    const userDocuments = userSnapshot.docs.filter(({ id }) => id.endsWith("user:concurrent-user"));
    expect(userDocuments).toHaveLength(1);
  }, 30000);
});

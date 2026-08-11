const mockOnCall = jest.fn();
const mockOnRequest = jest.fn();

jest.mock("firebase-admin", () => ({ initializeApp: jest.fn() }));
jest.mock("firebase-functions/v2/https", () => ({
  onCall: (...args: unknown[]) => mockOnCall(...args),
  onRequest: (...args: unknown[]) => mockOnRequest(...args),
}));
jest.mock("../src/config", () => ({ configSecret: {} }));
jest.mock("../src/runtimeOptions", () => ({ explainRuntimeOptions: {} }));
jest.mock("../src/v1/explainCallable", () => ({ explainHandler: jest.fn() }));
jest.mock("../src/v1/explainStreamCallableHandler", () => ({
  explainStreamCallableHandler: jest.fn(),
}));
jest.mock("../src/v1/saveItemsCallable", () => ({ saveItemsHandler: jest.fn() }));

import * as functions from "../src/index";

describe("managed analysis function exports", () => {
  test("exposes callable streaming without the retired raw SSE route", () => {
    expect(functions).toHaveProperty("explainStreamCallable");
    expect(functions).not.toHaveProperty("explainStream");
    expect(mockOnRequest).not.toHaveBeenCalled();
  });
});

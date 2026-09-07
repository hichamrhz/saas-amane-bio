import { describe, it, expect } from "vitest";
import { parseDecimalInput, parseIntegerInput, requireString } from "@/lib/numbers";

describe("parseDecimalInput (cahier des charges §9 : virgule ou point décimal)", () => {
  it("accepte un point décimal", () => {
    expect(parseDecimalInput("12.5")).toBe("12.5");
  });
  it("accepte une virgule décimale et la normalise", () => {
    expect(parseDecimalInput("12,5")).toBe("12.5");
  });
  it("accepte un entier", () => {
    expect(parseDecimalInput("40")).toBe("40");
  });
  it("rejette une valeur vide plutôt que de la traiter comme zéro", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput(null)).toBeNull();
  });
  it("rejette une valeur non numérique", () => {
    expect(parseDecimalInput("abc")).toBeNull();
    expect(parseDecimalInput("-5")).toBeNull();
  });
});

describe("parseIntegerInput", () => {
  it("accepte un entier positif", () => {
    expect(parseIntegerInput("42")).toBe(42);
  });
  it("rejette les décimales", () => {
    expect(parseIntegerInput("42.5")).toBeNull();
  });
});

describe("requireString", () => {
  it("rejette les chaînes vides ou uniquement des espaces", () => {
    expect(requireString("   ")).toBeNull();
    expect(requireString("")).toBeNull();
  });
  it("garde une valeur normale", () => {
    expect(requireString(" Vinaigre ")).toBe("Vinaigre");
  });
});
